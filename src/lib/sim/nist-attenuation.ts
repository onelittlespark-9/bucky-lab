// Diagnostic primary-beam attenuation model derived from NIST XCOM / ICRU-44 tissue tables.
// Values below are mass attenuation coefficients (mu/rho, cm^2/g) sampled at
// 30, 40, 50, 60, 80, 100, 120 and 150 keV. Linear attenuation is (mu/rho)*density.
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

const ENERGY_KEV = [30, 40, 50, 60, 80, 100, 120, 150] as const;
type Curve = readonly [number, number, number, number, number, number, number, number];

const MASS_MU: Record<RadiographicMaterial, Curve> = {
  air: [0.353, 0.248, 0.208, 0.188, 0.166, 0.154, 0.146, 0.136],
  inflatedLung: [0.3815, 0.2699, 0.2270, 0.2053, 0.1826, 0.1695, 0.1608, 0.1494],
  adipose: [0.3063, 0.2396, 0.2123, 0.1974, 0.1800, 0.1688, 0.1607, 0.1493],
  soft: [0.3790, 0.2688, 0.2264, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  muscle: [0.3783, 0.2685, 0.2262, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  blood: [0.3790, 0.2690, 0.2268, 0.2052, 0.1827, 0.1695, 0.1610, 0.1494],
  brain: [0.3770, 0.2680, 0.2260, 0.2045, 0.1820, 0.1690, 0.1605, 0.1489],
  trabecularBone: [0.770, 0.460, 0.335, 0.275, 0.215, 0.188, 0.171, 0.151],
  corticalBone: [1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855, 0.1644, 0.1480],
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

export function materialDensity(material:RadiographicMaterial):number{
  return DENSITY_G_CM3[material];
}

const AL_MASS_MU: Curve = [1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1540, 0.1378];
const AL_DENSITY_G_CM3 = 2.699;
export const DEFAULT_FILTRATION_MM_AL = 2.5;

function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function interpolate(curve:Curve,energyKev:number):number{
  const e=Math.max(ENERGY_KEV[0],Math.min(ENERGY_KEV[ENERGY_KEV.length-1],energyKev));
  for(let i=0;i<ENERGY_KEV.length-1;i++){
    const e0=ENERGY_KEV[i]!,e1=ENERGY_KEV[i+1]!;
    if(e<=e1){const t=Math.log(e/e0)/Math.log(e1/e0);return lerp(curve[i]!,curve[i+1]!,t);}
  }
  return curve[curve.length-1]!;
}

export function linearAttenuationAtEnergy(material:RadiographicMaterial,energyKev:number):number{
  return interpolate(MASS_MU[material],energyKev)*DENSITY_G_CM3[material];
}

export function aluminiumLinearAttenuationAtEnergy(energyKev:number):number{
  return interpolate(AL_MASS_MU,energyKev)*AL_DENSITY_G_CM3;
}

function aluminiumTransmission(energyKev:number,filtrationMmAl:number){
  const pathCm=Math.max(0,filtrationMmAl)/10;
  return Math.exp(-aluminiumLinearAttenuationAtEnergy(energyKev)*pathCm);
}

export interface SpectrumBin {
  energyKev:number;
  sourceWeight:number;
  detectorResponse:number;
  weight:number;
}

const spectrumCache=new Map<string,readonly SpectrumBin[]>();

export function diagnosticSpectrum(kvp:number,filtrationMmAl=DEFAULT_FILTRATION_MM_AL):readonly SpectrumBin[]{
  const k=Math.round(Math.max(40,Math.min(150,kvp)));
  const filtration=Math.max(0,Math.min(10,filtrationMmAl));
  const key=`${k}:${filtration.toFixed(2)}`;
  const cached=spectrumCache.get(key);if(cached)return cached;
  const raw:Array<Omit<SpectrumBin,"weight">>=[];
  const maxEnergy=Math.max(30,k-2);
  for(let e=24;e<=maxEnergy;e+=4){
    const continuum=Math.max(0,(k-e)*e);
    const filterTransmission=aluminiumTransmission(e,filtration);
    const tungstenLines=k>=72?(Math.exp(-Math.pow((e-59.3)/2.8,2))*.18+Math.exp(-Math.pow((e-67.2)/3.1,2))*.10):0;
    const sourceWeight=continuum*filterTransmission*(1+tungstenLines);
    const detectorResponse=Math.pow(e/60,.28);
    if(sourceWeight>0)raw.push({energyKev:e,sourceWeight,detectorResponse});
  }
  const total=raw.reduce((s,b)=>s+b.sourceWeight*b.detectorResponse,0)||1;
  const normalised=raw.map(b=>({...b,weight:(b.sourceWeight*b.detectorResponse)/total}));
  spectrumCache.set(key,normalised);return normalised;
}

export function effectivePhotonEnergyKev(kvp:number,filtrationMmAl=DEFAULT_FILTRATION_MM_AL):number{
  const spectrum=diagnosticSpectrum(kvp,filtrationMmAl);
  return spectrum.reduce((s,b)=>s+b.energyKev*b.weight,0);
}

export function linearAttenuation(material:RadiographicMaterial,kvp:number):number{
  return diagnosticSpectrum(kvp).reduce((s,b)=>s+b.weight*linearAttenuationAtEnergy(material,b.energyKev),0);
}

export function materialTransmission(material:RadiographicMaterial,pathCm:number,kvp:number):number{
  const path=Math.max(0,pathCm);if(path===0)return 1;
  let transmission=0;
  for(const bin of diagnosticSpectrum(kvp))transmission+=bin.weight*Math.exp(-linearAttenuationAtEnergy(material,bin.energyKev)*path);
  return Math.max(1e-12,transmission);
}

export function materialOpticalDepth(material:RadiographicMaterial,pathCm:number,kvp:number):number{
  return -Math.log(materialTransmission(material,pathCm,kvp));
}

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

export function primaryOpticalDepth(paths:MaterialPath,kvp:number):number{
  return -Math.log(primaryTransmission(paths,kvp));
}

export function relativeTubeOutput(kvp:number):number{return Math.pow(Math.max(40,kvp)/80,1.85);}
