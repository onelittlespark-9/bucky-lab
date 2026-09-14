import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { addSharedOrganPaths } from "./shared-anatomy-sampling";
import { addSharedTissueLayers } from "./shared-tissue-sampling";
import { samplePaChest } from "./pa-chest-model";
import { sampleFullBody } from "./full-body-model";
import { buildMetrics, fieldScatter, incidentFluence, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { projectionGeometry } from "./projection-physics";
import { createPrimaryBeamModel, type MaterialPath, type PrimaryRayTrace, type RadiographicMaterial } from "./nist-attenuation";
import { projectAtlasTissuePaths, type AtlasTissueMaterialPaths } from "./atlas-tissue-projector";
import { projectAtlasSkeletalPaths, type AtlasSkeletalMaterialPaths } from "./atlas-skeletal-projector";
import { canonicalAtlasMaterialProjection, usesCanonicalAtlasProjection } from "./canonical-atlas-projection";
import { scoreExposure } from "./scoring";
import { caseById } from "./case-bank";
import type { PathologyId } from "./requests";

function pathsToMaterials(p:Paths):MaterialPath{return{
  air:Math.max(0,p.air+p.gas*40),
  inflatedLung:Math.max(0,p.lung),
  adipose:Math.max(0,p.fat),
  soft:Math.max(0,p.soft*1.05),
  trabecularBone:Math.max(0,p.bone),
  corticalBone:Math.max(0,p.cortical),
  metal:Math.max(0,p.metal),
};}
function ellipse(x:number,y:number,cx:number,cy:number,rx:number,ry:number){const q=((x-cx)/rx)**2+((y-cy)/ry)**2;return q<1?1-q:0;}
function removePath(paths:MaterialPath,amount:number,order:readonly RadiographicMaterial[]){let left=Math.max(0,amount),removed=0;for(const material of order){if(left<=0)break;const current=Math.max(0,paths[material]??0),take=Math.min(current,left);if(take>0){paths[material]=current-take;left-=take;removed+=take;}}return removed;}
function addPath(paths:MaterialPath,material:RadiographicMaterial,amount:number){if(amount>0)paths[material]=Math.max(0,paths[material]??0)+amount;}
function applyPathologyMaterials(paths:MaterialPath,id:PathologyId,x:number,y:number,p:Projection){
  if(p.anatomy!=="torso-ap"&&p.anatomy!=="torso-lat")return;
  if(id==="consolidation"){
    const q=.95*ellipse(x,y,-5.5,43,5.5,6),target=4.5*q;
    const replaced=removePath(paths,target,["inflatedLung","air"]);
    addPath(paths,"soft",replaced*.72);addPath(paths,"blood",replaced*.28);
  }else if(id==="pneumothorax"){
    const q=.95*ellipse(x,y,-8.5,32,5.5,8),target=6*q;
    const replaced=removePath(paths,target,["inflatedLung","soft","muscle","blood"]);
    addPath(paths,"air",replaced);
  }else if(id==="rib-fracture"){
    const q=ellipse(x,y,10,34,1.2,1.1),bone=.16*q;
    removePath(paths,bone,["soft","muscle","adipose"]);addPath(paths,"corticalBone",bone);
  }
}
function addPacemaker(p:Paths,x:number,y:number,projection:Projection,on:boolean){if(!on||(projection.anatomy!=="torso-ap"&&projection.anatomy!=="torso-lat"))return;p.metal+=(ellipse(x,y,-8,29,2.7,3.4)+Math.exp(-(((x+3.5)**2)/1.4+((y-35)**2)/34))+Math.exp(-(((x+4.5)**2)/1.2+((y-40)**2)/38)))*14;}
function atlasTissueAt(m:AtlasTissueMaterialPaths,i:number):MaterialPath{return{adipose:m.adipose[i]!,muscle:m.muscle[i]!,soft:m.soft[i]!,inflatedLung:m.inflatedLung[i]!,blood:m.blood[i]!,brain:m.brain[i]!,air:m.air[i]!};}
function mergeSkeletal(paths:MaterialPath,m:AtlasSkeletalMaterialPaths,i:number){const displaced=m.displacedSoft[i]!;removePath(paths,displaced,["soft","muscle","adipose","inflatedLung","blood","brain","air"]);addPath(paths,"corticalBone",m.corticalBone[i]!);addPath(paths,"trabecularBone",m.trabecularBone[i]!);addPath(paths,"adipose",m.adipose[i]!);}
function totalPath(paths:MaterialPath){let total=0;for(const [material,value] of Object.entries(paths) as [RadiographicMaterial,number][])if(material!=="air")total+=Math.max(0,value??0);return total;}
function bonePath(paths:MaterialPath){return Math.max(0,paths.corticalBone??0)+Math.max(0,paths.trabecularBone??0);}

type DebugRay={px:number;py:number;label:string};
type DebugRecord={ray:DebugRay;trace:PrimaryRayTrace;rendererOD:number;primaryTransmission:number;measuredPrimaryOD:number;errorPct:number;detectorTransmission?:number;detectorOD?:number;displayPixel?:number;};
function physicsDebugRays(width:number,height:number):DebugRay[]{if(typeof window==="undefined")return[];const q=new URLSearchParams(window.location.search);if(q.get("physicsDebug")!=="1")return[];const raw=q.get("debugRays")??"0.50,0.50|0.35,0.50|0.65,0.50",out:DebugRay[]=[];for(const[index,token]of raw.split("|").entries()){const[xs,ys]=token.split(","),x=Number(xs),y=Number(ys);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const normalised=x>=0&&x<=1&&y>=0&&y<=1,px=normalised?Math.round(x*(width-1)):Math.round(x),py=normalised?Math.round(y*(height-1)):Math.round(y);if(px>=0&&px<width&&py>=0&&py<height)out.push({px,py,label:`ray-${index+1}`});}return out;}
function debugIndexMap(rays:DebugRay[],width:number){const m=new Map<number,DebugRay>();for(const r of rays)m.set(r.py*width+r.px,r);return m;}
function printPhysicsDebug(records:DebugRecord[],projectionId:string,kvp:number){if(!records.length)return;console.groupCollapsed(`[Bucky Lab physics debug] ${projectionId} ${kvp} kVp — ${records.length} ray(s)`);for(const r of records){console.group(`${r.ray.label} @ pixel (${r.ray.px}, ${r.ray.py})`);console.table(r.trace.materials.map(m=>({material:m.material,pathCm:m.pathCm})));console.table(r.trace.bins.map(b=>({energyKeV:b.energyKev,spectrumWeight:b.spectrumWeight,opticalDepthSumMuL:b.opticalDepth,transmissionExpMinusTau:b.transmission,...Object.fromEntries(b.contributions.map(c=>[`${c.material} mu`,c.muCmInv]))})));console.log("Beer-Lambert verification",{finalOpticalDepth:r.rendererOD,measuredPrimaryTransmission:r.primaryTransmission,minusLnMeasuredPixel:r.measuredPrimaryOD,errorPct:r.errorPct,withinTwoPercent:r.errorPct<=2});if(r.detectorTransmission!==undefined)console.log("detector/scatter stage",{normalisedDetectorTransmission:r.detectorTransmission,minusLnDetectorTransmission:r.detectorOD});if(r.displayPixel!==undefined)console.log("post-processed display pixel (not a Beer-Lambert quantity)",{displayPixel:r.displayPixel,minusLnDisplayPixel:r.displayPixel>0?-Math.log(r.displayPixel):Infinity});if(r.errorPct>2)console.error("Beer-Lambert invariant FAILED: renderer OD and -ln(raw primary pixel) differ by more than 2%.");console.groupEnd();}console.groupEnd();}

export function preloadRadiographAssets(_p:Projection[]){}
function localCoords(projection:Projection,patient:Patient,pose:SimPose,px:number,py:number,w:number,h:number,tube:TubeState,geometry:ReturnType<typeof projectionGeometry>){const cmX=((px+.5)/w-.5)*tube.collimationW/geometry.magnification,cmY=((py+.5)/h-.5)*tube.collimationH/geometry.magnification,angle=tube.angle*Math.PI/180,ry=cmY*Math.cos(pose.oblique*Math.PI/180)-cmX*Math.sin(pose.oblique*Math.PI/180)*.18-Math.tan(angle)*geometry.oidCm,lateral=projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat";if(lateral)return{x:tube.crX+cmX,y:tube.crY+ry};const rx=cmX*Math.cos(pose.rotationY*Math.PI/180);if(projection.anatomy==="torso-ap"||projection.anatomy==="shoulder-ap"||projection.anatomy==="full-body-ap")return{x:tube.crX+rx,y:tube.crY+ry};return{x:rx+tube.crX*.15,y:ry+(tube.crY-projection.cr.y)*.25};}
function assertFrameQuality(signal:Float32Array,width:number,height:number,satFraction:number,mean:number,minVariance=.025){const n=width*height;if(n<100)throw new Error("Render failed — detector matrix is too small.");if(satFraction>.82)throw new Error(`Render failed — image is severely over-exposed (${Math.round(satFraction*100)}% of pixels saturated).`);if(!Number.isFinite(mean)||mean<.02)throw new Error("Render failed — almost no signal reached the detector.");let variance=0;for(let i=0;i<n;i++){const d=signal[i]!-mean;variance+=d*d;}if(variance/n<minVariance)throw new Error("Render failed — image has almost no anatomical structure.");}
function percentile(values:number[],q:number){if(!values.length)return 0;values.sort((a,b)=>a-b);return values[Math.max(0,Math.min(values.length-1,Math.round((values.length-1)*q)))]!;}
function blurScalar(src:Float32Array,w:number,h:number,radius:number){if(radius<=0)return new Float32Array(src);const tmp=new Float32Array(src.length),out=new Float32Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let d=-radius;d<=radius;d++){const xx=Math.max(0,Math.min(w-1,x+d)),wt=radius+1-Math.abs(d);s+=src[y*w+xx]!*wt;n+=wt;}tmp[y*w+x]=s/n;}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let d=-radius;d<=radius;d++){const yy=Math.max(0,Math.min(h-1,y+d)),wt=radius+1-Math.abs(d);s+=tmp[yy*w+x]!*wt;n+=wt;}out[y*w+x]=s/n;}return out;}
function smooth01(v:number){const t=clamp(v,0,1);return t*t*(3-2*t);}
function detectorTone(detectorOD:number,fineOD:number,broadOD:number,bodyWeight:number,anchors:{low:number;mid:number;high:number},clinicalProcessing:boolean){if(bodyWeight<=.002&&detectorOD<.004)return .025;const lowSpan=Math.max(.035,anchors.mid-anchors.low),highSpan=Math.max(.060,anchors.high-anchors.mid);let base:number;if(detectorOD<=anchors.mid){const t=clamp((detectorOD-anchors.low)/lowSpan,0,1);base=(clinicalProcessing?.082:.080)+(clinicalProcessing?.375:.39)*Math.pow(t,clinicalProcessing?.98:.94);}else{const t=clamp((detectorOD-anchors.mid)/highSpan,0,1);base=.455+(clinicalProcessing?.335:.35)*Math.pow(t,.82);}const span=Math.max(.12,anchors.high-anchors.low),fineBand=clamp((detectorOD-fineOD)/span,-.10,.10),midBand=clamp((fineOD-broadOD)/span,-.16,.16),detailGate=smooth01(clamp((bodyWeight-.08)/.72,0,1)),fineGain=clinicalProcessing?.16:.095,midGain=clinicalProcessing?.24:.14;let tone=base+detailGate*(fineBand*fineGain+midBand*midGain);tone=clamp(tone,.035,.94);const pathWeight=smooth01(clamp((bodyWeight-.025)/.975,0,1));return .025*(1-pathWeight)+tone*pathWeight;}

export async function renderRadiograph(args:{patient:Patient;projection:Projection;pose:SimPose;tube:TubeState;exposure:ExposureState;pathologyId?:PathologyId;caseId?:string|null;width?:number;height?:number;}):Promise<RadiographResult>{
  const{patient,projection,pose,tube,exposure,pathologyId="none",caseId}=args;
  try{
    const simCase=caseById(caseId),aspect=tube.collimationW/tube.collimationH,height=args.height??768,width=args.width??Math.max(128,Math.round(height*aspect));
    if(width<64||height<64||width>2048||height>2048)throw new Error(`Render failed — invalid detector size ${width}×${height}.`);
    const kvp=exposure.kvp,beam=createPrimaryBeamModel(kvp),grid=exposure.grid,geometry=projectionGeometry(projection,tube,pose,exposure.focalSpot),I0=incidentFluence(kvp,exposure.mas,tube.sid,grid),thickness=partThickness(patient,projection),scatterFrac=fieldScatter(tube.collimationW,tube.collimationH,thickness,grid),seed=hashPatient(patient.id),ctx:SampleCtx={patient,projection,pose,seed},isPaChest=projection.id==="pa-chest",isWholeBody=projection.id==="ap-full-body",clinicalProcessing=isPaChest||isWholeBody,canonicalView=usesCanonicalAtlasProjection(projection),n=width*height,debugRays=physicsDebugRays(width,height),debugMap=debugIndexMap(debugRays,width),debugRecords:DebugRecord[]=[];
    let atlasTissue:AtlasTissueMaterialPaths|null=null,atlasSkeletal:AtlasSkeletalMaterialPaths|null=null,atlasMask:Float32Array|null=null,atlasError:string|null=null;
    try{
      if(canonicalView){const maps=await canonicalAtlasMaterialProjection({patient,projection,tube,width,height,geometry});atlasTissue=maps.tissue;atlasSkeletal=maps.skeletal;atlasMask=maps.tissueMask;}
      else{[atlasSkeletal,atlasTissue]=await Promise.all([projectAtlasSkeletalPaths({patient,projection,pose,tube,width,height,geometry,wholeBody:false}),projectAtlasTissuePaths({patient,projection,tube,width,height,geometry,wholeBody:false})]);if(atlasTissue){atlasMask=new Float32Array(n);for(let i=0;i<n;i++)atlasMask[i]=(atlasTissue.adipose[i]!+atlasTissue.muscle[i]!+atlasTissue.soft[i]!+atlasTissue.inflatedLung[i]!+atlasTissue.blood[i]!+atlasTissue.brain[i]!+atlasTissue.air[i]!)>.003?1:0;}}
    }catch(err){atlasError=err instanceof Error?err.message:String(err);console.warn("[Bucky Lab] Atlas path projection failed:",atlasError);}
    const boneCoverage=atlasSkeletal?atlasSkeletal.corticalBone.reduce((a,v,i)=>a+((v+atlasSkeletal!.trabecularBone[i]!)>.002?1:0),0)/n:0,tissueCoverage=atlasMask?atlasMask.reduce((a,v)=>a+(v>.5?1:0),0)/n:0,useBoneAtlas=!!atlasSkeletal&&boneCoverage>.001,useTissueAtlas=!!atlasTissue&&!!atlasMask&&tissueCoverage>.004,signal=new Float32Array(n),boneOD=new Float32Array(n),bodyWeightMap=new Float32Array(n);
    let sum=0;
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
      const i=py*width+px,{x,y}=localCoords(projection,patient,pose,px,py,width,height,tube,geometry),procedural=isPaChest?samplePaChest(x,y,patient,pose,seed):isWholeBody?sampleFullBody(x,y,patient,seed):sampleAnatomy(x,y,ctx);
      if(!isPaChest&&!isWholeBody&&(projection.anatomy==="torso-ap"||projection.anatomy==="torso-lat")){addSharedTissueLayers(procedural,x,y,patient,pose,projection);addSharedOrganPaths(procedural,x,y,patient,pose);}
      addPacemaker(procedural,x,y,projection,simCase?.device==="pacemaker");
      let materialPaths=pathsToMaterials(procedural);
      const atlasHere=useTissueAtlas&&(atlasMask?.[i]??0)>.5;
      if(atlasHere&&atlasTissue){const metal=materialPaths.metal??0;materialPaths=atlasTissueAt(atlasTissue,i);if(metal>0)materialPaths.metal=metal;}
      if(useBoneAtlas&&atlasSkeletal)mergeSkeletal(materialPaths,atlasSkeletal,i);
      applyPathologyMaterials(materialPaths,pathologyId,x,y,projection);
      const od=Math.max(.00001,beam.opticalDepth(materialPaths)),bOnly:MaterialPath={corticalBone:materialPaths.corticalBone??0,trabecularBone:materialPaths.trabecularBone??0},bone=beam.opticalDepth(bOnly);boneOD[i]=bone;
      const bodyPath=totalPath(materialPaths),bodyWeight=smooth01(clamp(bodyPath/2.5,0,1));bodyWeightMap[i]=bodyWeight;
      const primaryTransmission=beam.transmission(materialPaths),primarySignal=I0*primaryTransmission,measuredPrimaryOD=-Math.log(Math.max(1e-12,primaryTransmission));
      const scatterScale=bodyWeight>.04?.0018+.009*(1-Math.exp(-Math.max(0,od)*.5)):.00003,scatterSignal=I0*scatterFrac*scatterScale,bodySignal=primarySignal+scatterSignal,airSignal=I0*1.02+I0*scatterFrac*.00002,sig=airSignal*(1-bodyWeight)+bodySignal*bodyWeight;signal[i]=sig;sum+=sig;
      const debugRay=debugMap.get(i);if(debugRay){const denom=Math.max(Math.abs(od),1e-9),errorPct=Math.abs(measuredPrimaryOD-od)/denom*100;debugRecords.push({ray:debugRay,trace:beam.trace(materialPaths),rendererOD:od,primaryTransmission,measuredPrimaryOD,errorPct});}
    }
    const mean=sum/n,well=280;let satEstimate=0;for(let i=0;i<n;i++)if(signal[i]!>well)satEstimate++;assertFrameQuality(signal,width,height,satEstimate/n,mean,.018);
    const airReference=Math.max(1e-6,I0*1.02+I0*scatterFrac*.00002),detectorOD=new Float32Array(n),detectorSamples:number[]=[];
    for(let i=0;i<n;i++){detectorOD[i]=Math.max(0,-Math.log(clamp(signal[i]!/airReference,1e-6,1.02)));if(bodyWeightMap[i]>.50&&detectorOD[i]!>.002&&boneOD[i]<.12)detectorSamples.push(detectorOD[i]!);const r=debugRecords.find(d=>d.ray.py*width+d.ray.px===i);if(r){r.detectorTransmission=signal[i]!/airReference;r.detectorOD=detectorOD[i]!;}}
    const anchors={low:percentile([...detectorSamples],clinicalProcessing?.06:.05),mid:percentile([...detectorSamples],clinicalProcessing?.60:.58),high:percentile([...detectorSamples],clinicalProcessing?.996:.994)};if(anchors.mid<=anchors.low+.035)anchors.mid=anchors.low+.035;if(anchors.high<=anchors.mid+.060)anchors.high=anchors.mid+.060;
    const minDim=Math.min(width,height),fineDetectorOD=blurScalar(detectorOD,width,height,clinicalProcessing?Math.max(2,Math.min(4,Math.round(minDim/240))):3),broadDetectorOD=blurScalar(detectorOD,width,height,clinicalProcessing?Math.max(9,Math.min(18,Math.round(minDim/45))):Math.max(6,Math.min(12,Math.round(minDim/90)))),canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const g=canvas.getContext("2d");if(!g)throw new Error("Render failed — could not obtain 2D canvas context.");const img=g.createImageData(width,height);let sat=0,noiseAcc=0,contrastAcc=0,contrastN=0;const quantumNoise=.0010+.0034/Math.sqrt(Math.max(.6,exposure.mas)),blurRadius=geometry.geometricUnsharpnessMm>.28?1:0,blurWeight=blurRadius?Math.min(.045,geometry.geometricUnsharpnessMm*.022):0;
    for(let i=0;i<n;i++){const nx=i%width,ny=i/width|0;let tone=detectorTone(detectorOD[i]!,fineDetectorOD[i]!,broadDetectorOD[i]!,bodyWeightMap[i]!,anchors,clinicalProcessing);if(blurRadius>0&&nx>1&&nx<width-2&&ny>1&&ny<height-2){let neighbour=0,count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const j=(ny+dy)*width+nx+dx,wt=(dx===0||dy===0)?1:.7;neighbour+=detectorTone(detectorOD[j]!,fineDetectorOD[j]!,broadDetectorOD[j]!,bodyWeightMap[j]!,anchors,clinicalProcessing)*wt;count+=wt;}if(count>0)tone=tone*(1-blurWeight)+neighbour/count*blurWeight;}const bodyNoise=quantumNoise*(.10+.90*bodyWeightMap[i]!),fine=(fbm(nx*.61,ny*.61,seed+4)-.5)*2*bodyNoise,detector=(fbm(nx*.13,ny*.13,seed+17)-.5)*.0009,nse=fine+detector;tone=clamp(tone+nse,0,1);noiseAcc+=Math.abs(nse);if(signal[i]!>well)sat++;const v=Math.round(tone*255),o=i*4;img.data[o]=v;img.data[o+1]=v;img.data[o+2]=v;img.data[o+3]=255;if(nx>0){contrastAcc+=Math.abs(v-img.data[(i-1)*4]!);contrastN++;}const r=debugRecords.find(d=>d.ray.py*width+d.ray.px===i);if(r)r.displayPixel=v/255;}
    printPhysicsDebug(debugRecords,projection.id,kvp);const marker=exposure.marker==="L"||exposure.marker==="R"?exposure.marker:"R";stampMarker(img,width,height,marker,Math.round(width*.08),Math.round(height*.06));g.putImageData(img,0,0);const dataUrl=canvas.toDataURL("image/png"),metrics=buildMetrics(mean,noiseAcc/n,contrastN?contrastAcc/contrastN/255:0,sat/n,patient,projection,exposure,tube),scores=scoreExposure({patient,projection,pose,tube,exposure,metrics}),overall=scores.reduce((a,c)=>a+c.weight*gradeNum(c.grade),0)/scores.reduce((a,c)=>a+c.weight,0),overallGrade=overall>=.85?"excellent":overall>=.62?"acceptable":"repeat";
    if(atlasError||!useBoneAtlas||!useTissueAtlas)console.info("[Bucky Lab] atlas path coverage",{projection:projection.id,boneCoverage,tissueCoverage,atlasError});
    return{metrics,scores,overall,overallGrade,width,height,dataUrl};
  }catch(err){const message=err instanceof Error?err.message:String(err);if(message.startsWith("Render failed"))throw err;throw new Error(`Render failed — ${message}`);}
}
function gradeNum(g:"excellent"|"acceptable"|"repeat"){return g==="excellent"?1:g==="acceptable"?.7:.25;}
function stampMarker(img:ImageData,w:number,h:number,letter:"L"|"R",x:number,y:number){const glyph=letter==="L"?L_GLYPH:R_GLYPH,scale=5,put=(px:number,py:number,v:number)=>{if(px<0||py<0||px>=w||py>=h)return;const i=(py*w+px)*4;img.data[i]=v;img.data[i+1]=v;img.data[i+2]=v;img.data[i+3]=255;};for(let gy=0;gy<glyph.length;gy++)for(let gx=0;gx<glyph[gy]!.length;gx++)if(glyph[gy]![gx])for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)put(x+gx*scale+sx,y+gy*scale+sy,245);}
const L_GLYPH=[[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],R_GLYPH=[[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0]];
