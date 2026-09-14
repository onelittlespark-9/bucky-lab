// Diagnostic primary-beam attenuation model derived from NIST XCOM / ICRU-44 tables.
// Mass attenuation coefficients (mu/rho, cm^2/g) are interpolated as a function
// of photon energy; linear attenuation is (mu/rho)*density.
//
// IMPORTANT: radiographic primary transmission is calculated as
//   I / I0 = sum_E S(E) D(E) exp[-sum_m mu_m(E) x_m] / sum_E S(E) D(E)
// for all materials crossed by the same ray. Do not collapse the beam to one
// effective energy before Beer-Lambert integration: doing so removes beam hardening
// and gives the wrong kVp dependence.
//
// Sources: NIST SRD 126 / XCOM and ICRU-44 tissue compositions. Titanium is used
// as the representative high-Z implant/device material.

export type RadiographicMaterial =
  | "air"
  | "inflatedLung"
  | "adipose"
  | "soft"
  | "muscle"
  | "blood"
  | "brain"
  | "trabecularBone"
  | "corticalBone"
  | "metal";

export type MaterialPath = Partial<Record<RadiographicMaterial, number>>;

const MATERIALS: readonly RadiographicMaterial[] = [
  "air","inflatedLung","adipose","soft","muscle","blood","brain","trabecularBone","corticalBone","metal",
];
const ENERGY_KEV = [20, 30, 40, 50, 60, 80, 100, 120, 150] as const;
type Curve = readonly [number, number, number, number, number, number, number, number, number];

const MASS_MU: Record<RadiographicMaterial, Curve> = {
  air: [0.7779, 0.3538, 0.2485, 0.2080, 0.1875, 0.1662, 0.1541, 0.1460, 0.1356],
  inflatedLung: [0.8316, 0.3815, 0.2699, 0.2270, 0.2053, 0.1826, 0.1695, 0.1608, 0.1493],
  adipose: [0.5677, 0.3063, 0.2396, 0.2123, 0.1974, 0.1800, 0.1688, 0.1607, 0.1500],
  soft: [0.8230, 0.3790, 0.2688, 0.2264, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  muscle: [0.8205, 0.3783, 0.2685, 0.2262, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  blood: [0.8290, 0.3810, 0.2690, 0.2268, 0.2052, 0.1827, 0.1695, 0.1610, 0.1494],
  brain: [0.8120, 0.3770, 0.2680, 0.2260, 0.2045, 0.1820, 0.1690, 0.1605, 0.1489],
  trabecularBone: [2.28, 0.770, 0.460, 0.335, 0.275, 0.215, 0.188, 0.171, 0.151],
  corticalBone: [4.001, 1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855, 0.1644, 0.1480],
  metal: [15.85, 4.972, 2.214, 1.213, 0.7661, 0.4052, 0.2721, 0.2140, 0.1649],
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
  metal: 4.54,
};

export function materialDensity(material:RadiographicMaterial):number{return DENSITY_G_CM3[material];}

const AL_MASS_MU: Curve = [3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1540, 0.1378];
const AL_DENSITY_G_CM3 = 2.699;
export const DEFAULT_FILTRATION_MM_AL = 2.5;
export const MIN_DIAGNOSTIC_ENERGY_KEV = 20;
export const SPECTRUM_BIN_WIDTH_KEV = 2;

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
export function aluminiumLinearAttenuationAtEnergy(energyKev:number):number{return interpolate(AL_MASS_MU,energyKev)*AL_DENSITY_G_CM3;}
function aluminiumTransmission(energyKev:number,filtrationMmAl:number){return Math.exp(-aluminiumLinearAttenuationAtEnergy(energyKev)*Math.max(0,filtrationMmAl)/10);}

export interface SpectrumBin { energyKev:number; sourceWeight:number; detectorResponse:number; weight:number; }
const spectrumCache=new Map<string,readonly SpectrumBin[]>();
export function diagnosticSpectrum(kvp:number,filtrationMmAl=DEFAULT_FILTRATION_MM_AL):readonly SpectrumBin[]{
  const k=Math.round(Math.max(40,Math.min(150,kvp))),filtration=Math.max(0,Math.min(10,filtrationMmAl)),key=`${k}:${filtration.toFixed(2)}`,cached=spectrumCache.get(key);if(cached)return cached;
  const raw:Array<Omit<SpectrumBin,"weight">>=[],maxEnergy=Math.max(MIN_DIAGNOSTIC_ENERGY_KEV,k-2);
  for(let e=MIN_DIAGNOSTIC_ENERGY_KEV;e<=maxEnergy;e+=SPECTRUM_BIN_WIDTH_KEV){
    const continuum=Math.max(0,(k-e)*e),filterTransmission=aluminiumTransmission(e,filtration),tungstenLines=k>=72?(Math.exp(-Math.pow((e-59.3)/2.8,2))*.18+Math.exp(-Math.pow((e-67.2)/3.1,2))*.10):0,sourceWeight=continuum*filterTransmission*(1+tungstenLines),detectorResponse=Math.pow(e/60,.28);
    if(sourceWeight>0)raw.push({energyKev:e,sourceWeight,detectorResponse});
  }
  const total=raw.reduce((s,b)=>s+b.sourceWeight*b.detectorResponse,0)||1,normalised=raw.map(b=>({...b,weight:(b.sourceWeight*b.detectorResponse)/total}));spectrumCache.set(key,normalised);return normalised;
}

export function effectivePhotonEnergyKev(kvp:number,filtrationMmAl=DEFAULT_FILTRATION_MM_AL):number{return diagnosticSpectrum(kvp,filtrationMmAl).reduce((s,b)=>s+b.energyKev*b.weight,0);}
export function spectrumWeightedLinearAttenuation(material:RadiographicMaterial,kvp:number):number{return diagnosticSpectrum(kvp).reduce((s,b)=>s+b.weight*linearAttenuationAtEnergy(material,b.energyKev),0);}

export interface PrimaryBeamBin {
  energyKev:number;
  weight:number;
  mu:Readonly<Record<RadiographicMaterial,number>>;
}
export interface PrimaryRayTraceBin {
  energyKev:number;
  spectrumWeight:number;
  opticalDepth:number;
  transmission:number;
  contributions:Array<{material:RadiographicMaterial;pathCm:number;muCmInv:number;muTimesPath:number}>;
}
export interface PrimaryRayTrace {
  kvp:number;
  materials:Array<{material:RadiographicMaterial;pathCm:number}>;
  bins:PrimaryRayTraceBin[];
  transmission:number;
  effectiveOpticalDepth:number;
}
export interface PrimaryBeamModel {
  kvp:number;
  bins:readonly PrimaryBeamBin[];
  transmission(paths:MaterialPath):number;
  opticalDepth(paths:MaterialPath):number;
  trace(paths:MaterialPath):PrimaryRayTrace;
}

const beamModelCache=new Map<string,PrimaryBeamModel>();
function normalisedPaths(paths:MaterialPath){
  const out:Array<{material:RadiographicMaterial;pathCm:number}>=[];
  for(const material of MATERIALS){const pathCm=Math.max(0,paths[material]??0);if(pathCm>0)out.push({material,pathCm});}
  return out;
}

export function createPrimaryBeamModel(kvp:number,filtrationMmAl=DEFAULT_FILTRATION_MM_AL):PrimaryBeamModel{
  const k=Math.round(Math.max(40,Math.min(150,kvp))),filtration=Math.max(0,Math.min(10,filtrationMmAl)),key=`${k}:${filtration.toFixed(2)}`,cached=beamModelCache.get(key);if(cached)return cached;
  const bins=diagnosticSpectrum(k,filtration).map(bin=>{const mu={} as Record<RadiographicMaterial,number>;for(const material of MATERIALS)mu[material]=linearAttenuationAtEnergy(material,bin.energyKev);return{energyKev:bin.energyKev,weight:bin.weight,mu:Object.freeze(mu)};});
  const transmission=(paths:MaterialPath)=>{
    const active=normalisedPaths(paths);if(!active.length)return 1;let total=0;
    for(const bin of bins){let tau=0;for(const p of active)tau+=bin.mu[p.material]*p.pathCm;total+=bin.weight*Math.exp(-tau);}
    return Math.max(1e-12,Math.min(1,total));
  };
  const model:PrimaryBeamModel={kvp:k,bins,transmission,opticalDepth:(paths)=>-Math.log(transmission(paths)),trace:(paths)=>{
    const materials=normalisedPaths(paths);let total=0;const tracedBins:PrimaryRayTraceBin[]=[];
    for(const bin of bins){let opticalDepth=0;const contributions=materials.map(p=>{const muCmInv=bin.mu[p.material],muTimesPath=muCmInv*p.pathCm;opticalDepth+=muTimesPath;return{...p,muCmInv,muTimesPath};});const t=Math.exp(-opticalDepth);total+=bin.weight*t;tracedBins.push({energyKev:bin.energyKev,spectrumWeight:bin.weight,opticalDepth,transmission:t,contributions});}
    total=Math.max(1e-12,Math.min(1,total));return{kvp:k,materials,bins:tracedBins,transmission:total,effectiveOpticalDepth:-Math.log(total)};
  }};
  beamModelCache.set(key,model);return model;
}

export function materialTransmission(material:RadiographicMaterial,pathCm:number,kvp:number):number{return createPrimaryBeamModel(kvp).transmission({[material]:Math.max(0,pathCm)});}
export function materialOpticalDepth(material:RadiographicMaterial,pathCm:number,kvp:number):number{return -Math.log(materialTransmission(material,pathCm,kvp));}
export function primaryTransmission(paths:MaterialPath,kvp:number):number{return createPrimaryBeamModel(kvp).transmission(paths);}
export function primaryOpticalDepth(paths:MaterialPath,kvp:number):number{return createPrimaryBeamModel(kvp).opticalDepth(paths);}
export function tracePrimaryRay(paths:MaterialPath,kvp:number):PrimaryRayTrace{return createPrimaryBeamModel(kvp).trace(paths);}
export function relativeTubeOutput(kvp:number):number{return Math.pow(Math.max(40,kvp)/80,1.85);}
