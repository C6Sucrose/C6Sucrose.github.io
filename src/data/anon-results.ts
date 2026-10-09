// mAP and Rank-1 converted from ratios to percentages. Leakage is already percent.
// Source: C6Sucrose/anon4reid@b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3.
export const anonResults = [
  { id: 'blur', name: 'L1 · Gaussian blur', image: 'blur', map: 69.7591374030192, rank1: 80.70071339607239, leakage: 88.658, note: 'Face blur preserves much of the retrieval signal, but the attacker still recognizes most query identities.' },
  { id: 'sd', name: 'L2 · SD inpainting', image: 'sd', map: 1.9830920459727643, rank1: 5.463182926177979, leakage: 11.7577, note: 'Body-level inpainting sharply reduces identity recovery, alongside a large loss in retrieval utility.' },
  { id: 'rad', name: 'L3 · RAD / ControlNet', image: 'rad', map: 0.1484206721596785, rank1: 0.05938242538832128, leakage: 0.1485, note: 'The recorded attacker recognizes 5 of 3,368 queries. Retrieval performance also approaches zero.' },
  { id: 'edge', name: 'L4 · Canny edges', image: 'edge', map: 1.1418638210638378, rank1: 2.3456057533621788, leakage: 0.1485, note: 'An edge representation removes most appearance cues; both measured identity recovery and retrieval are low.' },
] as const;

export const resultSource = 'https://github.com/C6Sucrose/anon4reid/tree/b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3/outputs/results';
