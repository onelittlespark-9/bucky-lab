// Diagnostic X-ray attenuation model derived from NIST XCOM / ICRU-44 tissue tables.
// Values below are mass attenuation coefficients (mu/rho, cm^2/g) sampled at
// 30, 40, 50, 60, 80 and 100 keV. Linear attenuation is (mu/rho)*density.
//
// The runtime integrates a compact filtered tungsten spectrum rather than
// collapsing every exposure to one effective photon energy. This keeps the
// material model energy-dependent while remaining fast enough for the teaching
// loop. It is deliberately a small browser approximation to a SpekPy/TASMIP
// spectrum, not a replacement for full spectrum or Monte-Carlo validation.
//
// Sources:
// NIST XCOM / ICRU tissue compositions (SRD 126 / ICRU 44).
// Effective densities are renderer calibration values: deeply inspired lung is
// modelled at 0.180 g/cm3 so atlas lung volume produces clinically visible
// radiolucency while preserving soft-tissue and vascular superimposition.

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
function monoLinearAttenuation(material:RadiographicMaterial,energyKev:number){return interpolate(MASS_MU[material],energyKev)*DENSITY_G_CM3[material];}

export interface SpectrumBin { energyKev:number; weight:number; }
const spectrumCache=new Map<number,readonly SpectrumBin[]>();

/** Compact filtered tungsten spectrum for browser transmission calculations. */
export function diagnosticSpectrum(kvp:number):readonly SpectrumBin[]{
  const k=Math.round(Math.max(40,Math.min(150,kvp)));
  const cached=spectrumCache.get(k);if(cached)return cached;
  const bins:SpectrumBin[]=[];
  // A simple Kramers-like continuum with filtration hardening. The important
  // runtime property is that kVp changes the entire weighted spectrum, not only
  // a single lookup energy. Six-keV bins keep this inexpensive.
  for(let e=30;e<=Math.min(100,k-2);e+=6){
    const continuum=Math.max(0,(k-e)*e);
    const filtration=Math.exp(-52/Math.pow(e,1.42));
    const detectorWeight=Math.pow(e/60,.22);
    const tungstenLines=k>=72?(Math.exp(-Math.pow((e-59)/4.8,2))*.20+Math.exp(-Math.pow((e-67)/5.5,2))*.11):0;
    const w=continuum*filtration*detectorWeight*(1+tungstenLines);
    if(w>0)bins.push({energyKev:e,weight:w});
  }
  const total=bins.reduce((s,b)=>s+b.weight,0)||1;
  const normalised=bins.map(b=>({energyKev:b.energyKev,weight:b.weight/total}));
  spectrumCache.set(k,normalised);return normalised;
}

export function effectivePhotonEnergyKev(kvp:number):number{
  const spectrum=diagnosticSpectrum(kvp);
  return spectrum.reduce((s,b)=>s+b.energyKev*b.weight,0);
}

/** Spectrum-weighted coefficient, useful for atlas material calibration. */
export function linearAttenuation(material:RadiographicMaterial,kvp:number):number{
  const spectrum=diagnosticSpectrum(kvp);
  return spectrum.reduce((s,b)=>s+b.weight*monoLinearAttenuation(material,b.energyKev),0);
}

/**
 * Polychromatic Beer-Lambert optical depth. This is the coefficient that gives
 * the same total primary transmission as integrating the spectrum through a
 * homogeneous path. It therefore includes first-order beam hardening.
 */
export function materialOpticalDepth(material:RadiographicMaterial,pathCm:number,kvp:number):number{
  const path=Math.max(0,pathCm);if(path===0)return 0;
  const spectrum=diagnosticSpectrum(kvp);
  let transmission=0;
  for(const bin of spectrum)transmission+=bin.weight*Math.exp(-monoLinearAttenuation(material,bin.energyKev)*path);
  return -Math.log(Math.max(1e-9,transmission));
}

export function relativeTubeOutput(kvp:number):number{return Math.pow(Math.max(40,kvp)/80,1.85);}
