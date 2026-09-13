// Diagnostic X-ray attenuation model derived from NIST XCOM / ICRU-44 tissue tables.
// Values below are mass attenuation coefficients (mu/rho, cm^2/g) sampled at
// 30, 40, 50, 60, 80 and 100 keV. Linear attenuation is (mu/rho)*density.
//
// Sources:
// https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/bone.html
// https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/muscle.html
// https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/lung.html
// https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/adipose.html
// https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/blood.html
// Reference attenuation curves come from NIST/ICRU data. Effective densities are
// renderer calibration values: deeply inspired whole-body lung is modelled at
// 0.210 g/cm3 so an atlas lung path genuinely replaces soft tissue, while
// cancellous bone is 0.62 g/cm3 to retain cortical/trabecular separation.

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
  inflatedLung: 0.210,
  adipose: 0.95,
  soft: 1.06,
  muscle: 1.05,
  blood: 1.06,
  brain: 1.04,
  trabecularBone: 0.62,
  corticalBone: 1.92,
};
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function interpolate(curve:Curve,energyKev:number):number{const e=Math.max(ENERGY_KEV[0],Math.min(ENERGY_KEV[ENERGY_KEV.length-1],energyKev));for(let i=0;i<ENERGY_KEV.length-1;i++){const e0=ENERGY_KEV[i]!,e1=ENERGY_KEV[i+1]!;if(e<=e1){const t=Math.log(e/e0)/Math.log(e1/e0);return lerp(curve[i]!,curve[i+1]!,t);}}return curve[curve.length-1]!;}
export function effectivePhotonEnergyKev(kvp:number):number{const k=Math.max(40,Math.min(150,kvp));return Math.max(30,Math.min(80,.42*k+7));}
export function linearAttenuation(material:RadiographicMaterial,kvp:number):number{return interpolate(MASS_MU[material],effectivePhotonEnergyKev(kvp))*DENSITY_G_CM3[material];}
export function materialOpticalDepth(material:RadiographicMaterial,pathCm:number,kvp:number):number{return linearAttenuation(material,kvp)*Math.max(0,pathCm);}
export function relativeTubeOutput(kvp:number):number{return Math.pow(Math.max(40,kvp)/80,1.85);}
