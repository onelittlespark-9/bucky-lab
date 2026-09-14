// Diagnostic primary-beam attenuation model derived from NIST XCOM / ICRU-44 tissue tables.
// Values below are mass attenuation coefficients (mu/rho, cm^2/g) sampled at
// 30, 40, 50, 60, 80 and 100 keV. Linear attenuation is (mu/rho)*density.
//
// IMPORTANT: radiographic primary transmission is calculated as
//   I / I0 = sum_E S(E) D(E) exp[-sum_m mu_m(E) x_m] / sum_E S(E) D(E)
// for all materials crossed by the same ray. Do not add separately calculated
// polychromatic optical depths for different materials: that breaks spectral
// coupling and gives the wrong beam-hardening behaviour.
//
// Sources: NIST XCOM / ICRU tissue compositions (SRD 126 / ICRU 44).

export type RadiographicMaterial =
  | "air"
  | "inflatedLung"
  | "adipose"
  | "soft"
  | "muscle"
  | "blood"
  | "brain"
  | "trabecularBone"
  | "corticalBone";

export type MaterialPath = Partial<Record<RadiographicMaterial, number>>;

const ENERGY_KEV = [30, 40, 50, 60, 80, 100] as const;
type Curve = readonly [number, number, number, number, number, number];
const MASS_MU: Record<RadiographicMaterial, Curve> = {
  air: [0.353, 0.248, 0.208, 0.188, 0.166, 0.154],
  inflatedLung: [0.3815, 0.2699, 0.2270, 0.2053, 0.1826, 0.1695],
  adipose: [0.3063, 0.2396, 0.2123, 0.1974, 0.1800, 0.1688],
  soft: [0.378, 0.269, 0.2265, 0.2050, 0.1824, 0.1694],
  muscle: [0.3783, 0.2685, 0.2262, 0.2048, 0.1823, 0.1693],
  blood: [0.379, 0.269, 0.2268, 0.2052, 0.1827, 0.1695],
  brain: [0.377, 0.268, 0.2260, 0.2045, 0.1820, 0.1690],
  trabecularBone: [0.77, 0.46, 0.335, 0.275, 0.215, 0.188],
  corticalBone: [1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855],
};

const DENSITY_G_CM3: Record<RadiographicMaterial, number> = {
  air: 0.001205,
  inflatedLung: 0.180,
  adipose: 0.95,
  soft: 1.06,
  muscle: 1.05,
  blood: 1.06,
  brain: 1.04,
  trabecularBone: 0.62,
  corticalBone: 1.92,
};

function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function interpolate(curve:Curve,energyKev:number):number{
  const e=Math.max(ENERGY_KEV[0],Math.min(ENERGY_KEV[ENERGY_KEV.length-1],energyKev));
  for(let i=0;i<ENERGY_KEV.length-1;i++){
    const e0=ENERGY_KEV[i]!,e1=ENERGY_KEV[i+1]!;
    if(e<=e1){const t=Math.log(e/e0)/Math.log(e1/e0);return lerp(curve[i]!,curve[i+1]!,t);}
  }
  return curve[curve.length-1]!;
}

/** Linear attenuation coefficient mu(E), cm^-1, at a specific photon energy. */
export function linearAttenuationAtEnergy(material:RadiographicMaterial,energyKev:number):number{
  return interpolate(MASS_MU[material],energyKev)*DENSITY_G_CM3[material];
}

export interface SpectrumBin {
  energyKev:number;
  /** Relative tungsten source fluence before detector weighting. */
  sourceWeight:number;
  /** Relative detector energy response / absorption efficiency. */
  detectorResponse:number;
  /** Normalised S(E)D(E) weight used by the transmission integral. */
  weight:number;
}

const spectrumCache=new Map<number,readonly SpectrumBin[]>();

/**
 * Compact filtered tungsten spectrum for browser primary-beam calculations.
 * This is a fast discrete approximation, not a substitute for SpekPy/TASMIP
 * or Monte-Carlo validation. Detector response is kept explicit so the code
 * follows the physical S(E)D(E) integral rather than hiding it in a grey LUT.
 */
export function diagnosticSpectrum(kvp:number):readonly SpectrumBin[]{
  const k=Math.round(Math.max(40,Math.min(150,kvp)));
  const cached=spectrumCache.get(k);if(cached)return cached;
  const raw:Array<Omit<SpectrumBin,"weight">>=[];
  for(let e=30;e<=Math.min(100,k-2);e+=6){
    const continuum=Math.max(0,(k-e)*e);
    // Approximate inherent + added filtration. This hardens the low-energy tail.
    const filtration=Math.exp(-52/Math.pow(e,1.42));
    const tungstenLines=k>=72?(Math.exp(-Math.pow((e-59)/4.8,2))*.20+Math.exp(-Math.pow((e-67)/5.5,2))*.11):0;
    const sourceWeight=continuum*filtration*(1+tungstenLines);
    // Generic CsI-like detector response proxy: absorbed signal increases with
    // energy over this range but not in direct proportion to photon energy.
    const detectorResponse=Math.pow(e/60,.22);
    if(sourceWeight>0)raw.push({energyKev:e,sourceWeight,detectorResponse});
  }
  const total=raw.reduce((s,b)=>s+b.sourceWeight*b.detectorResponse,0)||1;
  const normalised=raw.map(b=>({...b,weight:(b.sourceWeight*b.detectorResponse)/total}));
  spectrumCache.set(k,normalised);return normalised;
}

export function effectivePhotonEnergyKev(kvp:number):number{
  const spectrum=diagnosticSpectrum(kvp);
  return spectrum.reduce((s,b)=>s+b.energyKev*b.weight,0);
}

/** Spectrum-weighted coefficient, retained only for coarse calibration. */
export function linearAttenuation(material:RadiographicMaterial,kvp:number):number{
  return diagnosticSpectrum(kvp).reduce((s,b)=>s+b.weight*linearAttenuationAtEnergy(material,b.energyKev),0);
}

/** Homogeneous-material Beer-Lambert transmission. */
export function materialTransmission(material:RadiographicMaterial,pathCm:number,kvp:number):number{
  const path=Math.max(0,pathCm);if(path===0)return 1;
  let transmission=0;
  for(const bin of diagnosticSpectrum(kvp))transmission+=bin.weight*Math.exp(-linearAttenuationAtEnergy(material,bin.energyKev)*path);
  return Math.max(1e-12,transmission);
}

/** Homogeneous equivalent optical depth, -ln(I/I0). */
export function materialOpticalDepth(material:RadiographicMaterial,pathCm:number,kvp:number):number{
  return -Math.log(materialTransmission(material,pathCm,kvp));
}

/**
 * Heterogeneous primary transmission for one detector ray. Each energy bin sees
 * the summed optical depth of every material on that ray before exponentiation.
 * This preserves spectral coupling and therefore physically sensible beam
 * hardening through mixed anatomy.
 */
export function primaryTransmission(paths:MaterialPath,kvp:number):number{
  let transmission=0;
  for(const bin of diagnosticSpectrum(kvp)){
    let tau=0;
    for(const material of Object.keys(paths) as RadiographicMaterial[]){
      const path=Math.max(0,paths[material]??0);
      if(path>0)tau+=linearAttenuationAtEnergy(material,bin.energyKev)*path;
    }
    transmission+=bin.weight*Math.exp(-tau);
  }
  return Math.max(1e-12,Math.min(1,transmission));
}

/** Heterogeneous primary optical depth for one detector ray. */
export function primaryOpticalDepth(paths:MaterialPath,kvp:number):number{
  return -Math.log(primaryTransmission(paths,kvp));
}

export function relativeTubeOutput(kvp:number):number{return Math.pow(Math.max(40,kvp)/80,1.85);}
