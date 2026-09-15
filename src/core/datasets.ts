export interface DatasetSource {
  id: string;
  title: string;
  version: string;
  repository: string;
  doi: string;
  accession?: string;
  imagingAccess: 'public' | 'controlled';
  derivedAccess?: string;
  citation: string;
  usagePolicyUrl: string;
  notes: string[];
}

export const HEALTHY_TOTAL_BODY_CTS: DatasetSource = {
  id: 'healthy-total-body-cts',
  title: 'Low-Dose CT Images of Healthy Cohort (Healthy-Total-Body-CTs)',
  version: '2',
  repository: 'The Cancer Imaging Archive (TCIA)',
  doi: '10.7937/NC7Z-4F76',
  accession: 'phs004225',
  imagingAccess: 'controlled',
  derivedAccess: 'Segmentations and clinical data are listed separately as CC BY 4.0 by TCIA.',
  citation: 'Selfridge, A. R., Spencer, B., Shiyam Sundar, L. K., Abdelhafez, Y., Nardo, L., Cherry, S. R., & Badawi, R. D. (2023). Low-Dose CT Images of Healthy Cohort (Healthy-Total-Body-CTs) (Version 2) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/NC7Z-4F76',
  usagePolicyUrl: 'https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/',
  notes: [
    'DICOM CT images are controlled-access and must not be mirrored or bundled into Bucky Lab without the required authorization.',
    'Bucky Lab stores provenance and attribution alongside every imported case.',
    'Do not generate or expose facial representations that could enable participant identification.',
  ],
};
