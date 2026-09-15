export type CtPhase='non-contrast'|'arterial'|'portal-venous'|'delayed'|'split-bolus-bastion';
export interface CtProtocol{id:string;name:string;category:string;coverage:string;phases:CtPhase[];defaultPhase:CtPhase;purpose:string}
export const CT_PROTOCOLS:CtProtocol[]=[
{id:'ct-head',name:'CT Head',category:'Neuro',coverage:'Vertex to skull base',phases:['non-contrast','arterial','delayed'],defaultPhase:'non-contrast',purpose:'Acute head assessment; non-contrast is the usual starting acquisition.'},
{id:'ct-cap',name:'CT Chest Abdomen Pelvis',category:'Body',coverage:'Thoracic inlet to symphysis pubis',phases:['arterial','portal-venous','delayed'],defaultPhase:'portal-venous',purpose:'General contrast-enhanced chest, abdominal and pelvic assessment.'},
{id:'ct-colonography',name:'CT Colonography',category:'Gastrointestinal',coverage:'Colon and abdomen/pelvis',phases:['non-contrast','portal-venous'],defaultPhase:'non-contrast',purpose:'Prepared, insufflated colonic assessment with 2-D and 3-D review.'},
{id:'ct-trauma',name:'Major Trauma CT',category:'Trauma',coverage:'Head, neck and torso as indicated',phases:['non-contrast','arterial','portal-venous','split-bolus-bastion','delayed'],defaultPhase:'split-bolus-bastion',purpose:'Whole-body trauma workflow including a Camp Bastion-style split-bolus teaching preset.'},
{id:'ctpa',name:'CT Pulmonary Angiogram',category:'Cardiothoracic',coverage:'Lung apices to bases',phases:['arterial'],defaultPhase:'arterial',purpose:'Pulmonary arterial assessment.'},
{id:'cta-aorta',name:'CT Aorta',category:'Vascular',coverage:'Aorta; indication dependent',phases:['non-contrast','arterial','delayed'],defaultPhase:'arterial',purpose:'Aortic pathology and vascular assessment.'},
{id:'ct-kub',name:'CT KUB',category:'Urinary',coverage:'Kidneys to bladder',phases:['non-contrast','delayed'],defaultPhase:'non-contrast',purpose:'Urinary tract assessment, particularly calculi.'}
];
export const PHASE_LABEL:Record<CtPhase,string>={'non-contrast':'Non-contrast',arterial:'Arterial phase','portal-venous':'Portal venous phase',delayed:'Delayed phase','split-bolus-bastion':'Split-bolus trauma (Camp Bastion style)'};
