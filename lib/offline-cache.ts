import AsyncStorage from '@react-native-async-storage/async-storage';
import { NearbyService, Incident, UserProfile, EmergencyContact } from '../types';

const CACHE_PREFIX = 'roadsos_services_cache_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  services: NearbyService[];
  timestamp: number;
  region: string;
}

// ── Goa ──
const GOA_SEED: NearbyService[] = [
  { id: 'gfs-panaji', name: 'Panaji Fire Station', service_type: 'fire_station', address: 'Opp. Caculo Mall, St. Inez, Panaji, Goa 403001', primary_phone: '0832-2225500', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 15.4866, lng: 73.8168 },
  { id: 'gfs-mapusa', name: 'Mapusa Fire Station', service_type: 'fire_station', address: 'Mapusa-Anjuna Rd, Mapusa, Goa 403507', primary_phone: '0832-2262900', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 15.5898, lng: 73.8089 },
  { id: 'gfs-margao', name: 'Margao Fire Station', service_type: 'fire_station', address: 'Aquem, Margao, Goa 403601', primary_phone: '0832-2714600', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 15.28, lng: 73.982 },
  { id: 'gmc', name: 'Goa Medical College & Hospital', service_type: 'trauma_centre', address: 'Bambolim, Panaji, Goa 403202', primary_phone: '0832-2458700', is_24x7: true, tags: { emergency: true, icu: true, trauma: true, govt: true }, distance_km: 0, lat: 15.4567, lng: 73.8278 },
  { id: 'manipal', name: 'Dr. Manipal Hospital Goa', service_type: 'hospital', address: 'Near Dona Paula Circle, Goa 403004', primary_phone: '0832-2453301', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 15.457, lng: 73.805 },
  { id: 'hospicio', name: 'Hospicio Hospital', service_type: 'hospital', address: 'Aquem, Margao, Goa 403601', primary_phone: '0832-2705664', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 15.281, lng: 73.986 },
  { id: 'ps-hq', name: 'Goa Police Headquarters', service_type: 'police', address: 'Panaji, Goa 403001', primary_phone: '0832-2225360', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 15.4989, lng: 73.8278 },
  { id: 'ps-panaji', name: 'Panaji Police Station', service_type: 'police', address: 'Panaji, Goa 403001', primary_phone: '0832-2226482', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 15.495, lng: 73.828 },
  { id: 'ps-calangute', name: 'Calangute Police Station', service_type: 'police', address: 'Chogm Road, Saligao, Goa 403511', primary_phone: '0832-2278284', is_24x7: true, tags: { emergency: true, tourist: true }, distance_km: 0, lat: 15.544, lng: 73.755 },
  { id: 'amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'State-wide, Goa', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true, govt: true }, distance_km: 0, lat: 15.4909, lng: 73.8278 },
  { id: 'amb-redcross', name: 'Indian Red Cross Ambulance', service_type: 'ambulance', address: 'Panaji, Goa 403001', primary_phone: '0832-2224601', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 15.493, lng: 73.824 },
  { id: 'tow-star', name: 'Goa Star Motors - 24hr Towing', service_type: 'towing', address: 'NH 66, Panaji, Goa 403001', primary_phone: '+91 84017 36297', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 15.485, lng: 73.83 },
  { id: 'punc-panaji', name: "Simon's Puncture & Tyre Works", service_type: 'puncture', address: 'Opp. KTC Bus Stand, Panaji, Goa 403001', primary_phone: '+91 94220 12345', is_24x7: false, tags: {}, distance_km: 0, lat: 15.497, lng: 73.827 },
  { id: 'punc-mapusa', name: 'Mapusa Tyre & Puncture Centre', service_type: 'puncture', address: 'Near Mapusa Market, Mapusa, Goa 403507', primary_phone: '+91 98231 56789', is_24x7: false, tags: {}, distance_km: 0, lat: 15.593, lng: 73.809 },
  { id: 'punc-margao', name: 'Margao Puncture Works', service_type: 'puncture', address: 'Gogol, Margao, Goa 403601', primary_phone: '+91 97654 67890', is_24x7: false, tags: {}, distance_km: 0, lat: 15.276, lng: 73.98 },
  { id: 'punc-vasco', name: 'Vasco Quick Fix Puncture', service_type: 'puncture', address: 'Mundvel, Vasco-da-Gama, Goa 403802', primary_phone: '+91 98501 23456', is_24x7: true, tags: {}, distance_km: 0, lat: 15.395, lng: 73.805 },
];

// ── Maharashtra ──
const MAHARASHTRA_SEED: NearbyService[] = [
  { id: 'mh-kem', name: 'KEM Hospital', service_type: 'trauma_centre', address: 'Parel, Mumbai, Maharashtra 400012', primary_phone: '022-24107000', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 19.0116, lng: 72.8381 },
  { id: 'mh-lilavati', name: 'Lilavati Hospital', service_type: 'hospital', address: 'Bandra West, Mumbai 400050', primary_phone: '022-26568000', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 19.0586, lng: 72.8385 },
  { id: 'mh-sion', name: 'Sion Hospital (LTMMC)', service_type: 'trauma_centre', address: 'Sion, Mumbai 400022', primary_phone: '022-24029999', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 19.041, lng: 72.8638 },
  { id: 'mh-police-mum', name: 'Mumbai Police Control Room', service_type: 'police', address: 'Crawford Market, Mumbai 400001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 18.9443, lng: 72.8333 },
  { id: 'mh-police-pune', name: 'Pune Police HQ', service_type: 'police', address: 'Shivaji Nagar, Pune 411005', primary_phone: '020-26126100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 18.5314, lng: 73.8446 },
  { id: 'mh-amb-108', name: '108 Ambulance Maharashtra', service_type: 'ambulance', address: 'Mumbai, Maharashtra', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 19.0213, lng: 72.8397 },
  { id: 'mh-tow-bandra', name: 'Bandra Towing Service', service_type: 'towing', address: 'Bandra West, Mumbai 400050', primary_phone: '+91 98200 12345', is_24x7: true, tags: {}, distance_km: 0, lat: 19.0552, lng: 72.8385 },
  { id: 'mh-fire-mum', name: 'Mumbai Fire Brigade HQ', service_type: 'fire_station', address: 'Mumbai Central 400008', primary_phone: '022-23083311', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 18.9685, lng: 72.8196 },
  { id: 'mh-punc-mum', name: 'Mumbai Puncture & Tyre Shop', service_type: 'puncture', address: 'Andheri East, Mumbai 400069', primary_phone: '+91 98200 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 19.1136, lng: 72.8697 },
  { id: 'mh-punc-pune', name: 'Pune Quick Puncture', service_type: 'puncture', address: 'Kothrud, Pune 411038', primary_phone: '+91 98500 11223', is_24x7: true, tags: {}, distance_km: 0, lat: 18.5074, lng: 73.8077 },
];

// ── Karnataka ──
const KARNATAKA_SEED: NearbyService[] = [
  { id: 'ka-nimhans', name: 'NIMHANS Hospital', service_type: 'trauma_centre', address: 'Hosur Road, Bengaluru 560029', primary_phone: '080-26995000', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 12.9352, lng: 77.5639 },
  { id: 'ka-manipal', name: 'Manipal Hospital', service_type: 'hospital', address: 'HAL Airport Road, Bengaluru 560017', primary_phone: '080-25023333', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 12.9573, lng: 77.6494 },
  { id: 'ka-police-blr', name: 'Bengaluru Police HQ', service_type: 'police', address: 'Nrupatunga Road, Bengaluru 560001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 12.9716, lng: 77.5946 },
  { id: 'ka-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Bengaluru, Karnataka', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 12.9716, lng: 77.5946 },
  { id: 'ka-fire-blr', name: 'Bengaluru Fire Station', service_type: 'fire_station', address: 'Cubbon Road, Bengaluru 560001', primary_phone: '080-22863300', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 12.9762, lng: 77.5929 },
  { id: 'ka-tow-blr', name: 'Bengaluru Highway Towing', service_type: 'towing', address: 'Hosur Road, Bengaluru 560068', primary_phone: '+91 98450 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 12.8996, lng: 77.6219 },
  { id: 'ka-victoria', name: 'Victoria Hospital', service_type: 'hospital', address: 'Fort Road, Bengaluru 560002', primary_phone: '080-26736666', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 12.9634, lng: 77.5855 },
  { id: 'ka-punc-blr', name: 'Bengaluru Puncture Works', service_type: 'puncture', address: 'Koramangala, Bengaluru 560034', primary_phone: '+91 98450 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 12.9352, lng: 77.6245 },
];

// ── Kerala ──
const KERALA_SEED: NearbyService[] = [
  { id: 'kl-gmc', name: 'Govt. Medical College Thiruvananthapuram', service_type: 'trauma_centre', address: 'Medical College PO, Thiruvananthapuram 695011', primary_phone: '0471-2522232', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 8.5241, lng: 76.9366 },
  { id: 'kl-aster', name: 'Aster Medcity', service_type: 'hospital', address: 'Kuthiravattom, Kochi 682027', primary_phone: '0484-4085555', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 9.9894, lng: 76.3558 },
  { id: 'kl-police-tvm', name: 'Thiruvananthapuram Police Control', service_type: 'police', address: 'Thiruvananthapuram 695001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 8.5241, lng: 76.9366 },
  { id: 'kl-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Kerala', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 8.5241, lng: 76.9366 },
  { id: 'kl-fire-tvm', name: 'Thiruvananthapuram Fire Station', service_type: 'fire_station', address: 'East Fort, Thiruvananthapuram 695023', primary_phone: '0471-2333500', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 8.5129, lng: 76.9496 },
  { id: 'kl-tow-kochi', name: 'Kochi Towing Service', service_type: 'towing', address: 'NH 66, Kochi 682001', primary_phone: '+91 98460 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 9.9312, lng: 76.2673 },
  { id: 'kl-punc-kochi', name: 'Kochi Puncture Shop', service_type: 'puncture', address: 'MG Road, Kochi 682011', primary_phone: '+91 98460 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 9.9816, lng: 76.2999 },
];

// ── Tamil Nadu ──
const TAMIL_NADU_SEED: NearbyService[] = [
  { id: 'tn-ggh', name: 'Govt. General Hospital (Rajiv Gandhi)', service_type: 'trauma_centre', address: 'Poonamallee High Road, Chennai 600003', primary_phone: '044-25305000', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 13.0827, lng: 80.2707 },
  { id: 'tn-apollo', name: 'Apollo Hospital Greams Road', service_type: 'hospital', address: 'Greams Road, Chennai 600006', primary_phone: '044-28293333', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 13.0627, lng: 80.2582 },
  { id: 'tn-police-ch', name: 'Chennai Police Control Room', service_type: 'police', address: 'Anna Salai, Chennai 600002', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 13.0569, lng: 80.2514 },
  { id: 'tn-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Chennai, Tamil Nadu', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 13.0827, lng: 80.2707 },
  { id: 'tn-fire-ch', name: 'Chennai Fire Station', service_type: 'fire_station', address: 'Park Town, Chennai 600003', primary_phone: '044-25301111', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 13.0878, lng: 80.2785 },
  { id: 'tn-tow-ch', name: 'Chennai Highway Towing', service_type: 'towing', address: 'OMR, Chennai 600096', primary_phone: '+91 98400 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 12.9692, lng: 80.2577 },
  { id: 'tn-cmc', name: 'CMC Vellore', service_type: 'hospital', address: 'Ida Scudder Road, Vellore 632004', primary_phone: '0416-2282020', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 12.9165, lng: 79.1325 },
  { id: 'tn-punc-ch', name: 'Chennai Puncture & Tyre Centre', service_type: 'puncture', address: 'T Nagar, Chennai 600017', primary_phone: '+91 98400 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 13.0418, lng: 80.2341 },
];

// ── Delhi ──
const DELHI_SEED: NearbyService[] = [
  { id: 'dl-aiims', name: 'AIIMS Trauma Centre', service_type: 'trauma_centre', address: 'Ansari Nagar, New Delhi 110029', primary_phone: '011-26594404', is_24x7: true, tags: { emergency: true, icu: true }, distance_km: 0, lat: 28.5677, lng: 77.2101 },
  { id: 'dl-gangaram', name: 'Sir Ganga Ram Hospital', service_type: 'hospital', address: 'Rajinder Nagar, New Delhi 110060', primary_phone: '011-25750000', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 28.6362, lng: 77.1831 },
  { id: 'dl-safdarjung', name: 'Safdarjung Hospital', service_type: 'hospital', address: 'Safdarjung Enclave, New Delhi 110029', primary_phone: '011-26165060', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 28.5631, lng: 77.2046 },
  { id: 'dl-police-hq', name: 'Delhi Police Headquarters', service_type: 'police', address: 'Jai Singh Marg, New Delhi 110001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 28.6226, lng: 77.2165 },
  { id: 'dl-cats', name: 'CATS Ambulance Delhi', service_type: 'ambulance', address: 'New Delhi', primary_phone: '102', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 28.6139, lng: 77.209 },
  { id: 'dl-fire-hq', name: 'Delhi Fire Service HQ', service_type: 'fire_station', address: 'Jai Singh Marg, New Delhi 110001', primary_phone: '011-23312000', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 28.6239, lng: 77.2173 },
  { id: 'dl-tow-dwarka', name: 'Dwarka Towing Service', service_type: 'towing', address: 'Dwarka Sector 12, New Delhi 110078', primary_phone: '+91 98100 98765', is_24x7: true, tags: {}, distance_km: 0, lat: 28.5915, lng: 77.0393 },
  { id: 'dl-punc-del', name: 'Delhi Puncture & Tyre Works', service_type: 'puncture', address: 'Karol Bagh, New Delhi 110005', primary_phone: '+91 98100 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 28.6507, lng: 77.1901 },
];

// ── Rajasthan ──
const RAJASTHAN_SEED: NearbyService[] = [
  { id: 'rj-sms', name: 'SMS Hospital', service_type: 'trauma_centre', address: 'JLN Marg, Jaipur 302004', primary_phone: '0141-2518121', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 26.8851, lng: 75.8219 },
  { id: 'rj-ckb', name: 'CK Birla Hospital', service_type: 'hospital', address: 'Rukmani Birla Hospital, Jaipur 302017', primary_phone: '0141-2505555', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 26.8467, lng: 75.8094 },
  { id: 'rj-police-jai', name: 'Jaipur Police Control Room', service_type: 'police', address: 'Jaipur 302001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 26.9124, lng: 75.7873 },
  { id: 'rj-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Jaipur, Rajasthan', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 26.9124, lng: 75.7873 },
  { id: 'rj-fire-jai', name: 'Jaipur Fire Station', service_type: 'fire_station', address: 'MI Road, Jaipur 302001', primary_phone: '0141-2373300', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 26.9157, lng: 75.8173 },
  { id: 'rj-tow-jai', name: 'Jaipur Highway Towing', service_type: 'towing', address: 'Ajmer Road, Jaipur 302006', primary_phone: '+91 98290 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 26.8851, lng: 75.7603 },
  { id: 'rj-punc-jai', name: 'Jaipur Puncture Shop', service_type: 'puncture', address: 'MI Road, Jaipur 302001', primary_phone: '+91 98290 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 26.9157, lng: 75.8173 },
];

// ── Gujarat ──
const GUJARAT_SEED: NearbyService[] = [
  { id: 'gj-civil', name: 'Civil Hospital Ahmedabad', service_type: 'trauma_centre', address: 'Asarwa, Ahmedabad 380016', primary_phone: '079-22682222', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 23.0423, lng: 72.6019 },
  { id: 'gj-sterling', name: 'Sterling Hospital', service_type: 'hospital', address: 'Gurukul Road, Ahmedabad 380052', primary_phone: '079-40011000', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 23.0395, lng: 72.5253 },
  { id: 'gj-police-ahm', name: 'Ahmedabad Police Control', service_type: 'police', address: 'Ashram Road, Ahmedabad 380009', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 23.0225, lng: 72.5714 },
  { id: 'gj-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Ahmedabad, Gujarat', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 23.0225, lng: 72.5714 },
  { id: 'gj-fire-ahm', name: 'Ahmedabad Fire Station', service_type: 'fire_station', address: 'Relief Road, Ahmedabad 380001', primary_phone: '079-22132222', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 23.0258, lng: 72.5873 },
  { id: 'gj-tow-ahm', name: 'Ahmedabad Towing Service', service_type: 'towing', address: 'SG Highway, Ahmedabad 380015', primary_phone: '+91 98250 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 23.0448, lng: 72.5219 },
  { id: 'gj-punc-ahm', name: 'Ahmedabad Puncture & Tyre Centre', service_type: 'puncture', address: 'CG Road, Ahmedabad 380006', primary_phone: '+91 98250 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 23.0302, lng: 72.5547 },
];

// ── Uttar Pradesh ──
const UTTAR_PRADESH_SEED: NearbyService[] = [
  { id: 'up-kgmu', name: 'KGMC Hospital', service_type: 'trauma_centre', address: 'Chowk, Lucknow 226003', primary_phone: '0522-2257540', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 26.8593, lng: 80.9462 },
  { id: 'up-apex', name: 'Apex Hospital', service_type: 'hospital', address: 'Kanpur Road, Lucknow 226012', primary_phone: '0522-4055555', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 26.8176, lng: 80.9193 },
  { id: 'up-police-lko', name: 'Lucknow Police Control', service_type: 'police', address: 'Lalbagh, Lucknow 226001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 26.8467, lng: 80.9462 },
  { id: 'up-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Lucknow, Uttar Pradesh', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 26.8467, lng: 80.9462 },
  { id: 'up-fire-lko', name: 'Lucknow Fire Station', service_type: 'fire_station', address: 'Hazratganj, Lucknow 226001', primary_phone: '0522-2234500', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 26.8489, lng: 80.9345 },
  { id: 'up-tow-lko', name: 'Lucknow Highway Towing', service_type: 'towing', address: 'Kanpur Road, Lucknow 226012', primary_phone: '+91 98380 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 26.8176, lng: 80.9093 },
  { id: 'up-punc-lko', name: 'Lucknow Puncture & Tyre Shop', service_type: 'puncture', address: 'Hazratganj, Lucknow 226001', primary_phone: '+91 98380 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 26.8489, lng: 80.9345 },
];

// ── West Bengal ──
const WEST_BENGAL_SEED: NearbyService[] = [
  { id: 'wb-sskm', name: 'SSKM Hospital (IPGMER)', service_type: 'trauma_centre', address: 'AJC Bose Road, Kolkata 700020', primary_phone: '033-22234050', is_24x7: true, tags: { emergency: true, govt: true }, distance_km: 0, lat: 22.5354, lng: 88.3442 },
  { id: 'wb-apollo', name: 'Apollo Gleneagles Hospital', service_type: 'hospital', address: 'EM Bypass, Kolkata 700054', primary_phone: '033-23203040', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 22.5565, lng: 88.3916 },
  { id: 'wb-police-kol', name: 'Kolkata Police Control Room', service_type: 'police', address: 'Lal Bazar, Kolkata 700001', primary_phone: '100', is_24x7: true, tags: { emergency: true }, distance_km: 0, lat: 22.5726, lng: 88.3639 },
  { id: 'wb-amb-108', name: '108 Emergency Ambulance', service_type: 'ambulance', address: 'Kolkata, West Bengal', primary_phone: '108', is_24x7: true, tags: { emergency: true, free: true }, distance_km: 0, lat: 22.5726, lng: 88.3639 },
  { id: 'wb-fire-kol', name: 'Kolkata Fire Brigade', service_type: 'fire_station', address: 'Wellesley Street, Kolkata 700016', primary_phone: '033-22293333', is_24x7: true, tags: { emergency: true, fire: true }, distance_km: 0, lat: 22.5526, lng: 88.3516 },
  { id: 'wb-tow-kol', name: 'Kolkata Towing Service', service_type: 'towing', address: 'EM Bypass, Kolkata 700107', primary_phone: '+91 98300 12345', is_24x7: true, tags: { highway: true }, distance_km: 0, lat: 22.5448, lng: 88.3898 },
  { id: 'wb-punc-kol', name: 'Kolkata Puncture & Tyre Works', service_type: 'puncture', address: 'Park Street, Kolkata 700016', primary_phone: '+91 98300 54321', is_24x7: false, tags: {}, distance_km: 0, lat: 22.5526, lng: 88.3516 },
];

// ── Region seed map ──
const REGION_SEEDS: Record<string, NearbyService[]> = {
  goa: GOA_SEED,
  maharashtra: MAHARASHTRA_SEED,
  karnataka: KARNATAKA_SEED,
  kerala: KERALA_SEED,
  'tamil-nadu': TAMIL_NADU_SEED,
  delhi: DELHI_SEED,
  rajasthan: RAJASTHAN_SEED,
  gujarat: GUJARAT_SEED,
  'uttar-pradesh': UTTAR_PRADESH_SEED,
  'west-bengal': WEST_BENGAL_SEED,
};

export function getSeedForRegion(regionKey: string): NearbyService[] {
  return REGION_SEEDS[regionKey] ?? [];
}

export const LEGACY_SEED_SERVICES = GOA_SEED;

/**
 * Saves nearby services to AsyncStorage keyed by region.
 */
export async function saveServicesCache(
  services: NearbyService[],
  region: string
): Promise<void> {
  const entry: CacheEntry = { services, timestamp: Date.now(), region };
  const key = `${CACHE_PREFIX}${region}`;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    if (__DEV__) console.warn('Storage write failed', e);
  }
}

/**
 * Loads cached nearby services for a specific region from AsyncStorage.
 */
export async function loadServicesCache(region: string): Promise<{
  services: NearbyService[];
  cacheAge: number | null;
  isExpired: boolean;
} | null> {
  const key = `${CACHE_PREFIX}${region}`;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    const entry: CacheEntry = JSON.parse(raw);
    const cacheAge = Date.now() - entry.timestamp;
    return {
      services: entry.services,
      cacheAge,
      isExpired: cacheAge > CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

/**
 * Clears the cache for a specific region.
 */
export async function clearServicesCache(region: string): Promise<void> {
  const key = `${CACHE_PREFIX}${region}`;
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    if (__DEV__) console.warn('Storage clear failed', e);
  }
}

/**
 * Computes Haversine distance from user location for each service and sorts nearest-first.
 */
export function computeDistances(
  services: NearbyService[] | undefined,
  userLat: number,
  userLng: number
): NearbyService[] {
  if (!services || services.length === 0) return [];
  return services
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number' && !isNaN(s.lat) && !isNaN(s.lng))
    .map((s) => ({
      ...s,
      distance_km: haversine(userLat, userLng, s.lat, s.lng),
    }))
    .sort((a, b) => a.distance_km - b.distance_km);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const clampedA = Math.min(1, Math.max(0, a));
  return R * 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
}

/**
 * Loads the user profile from AsyncStorage.
 * Validates that the parsed value is a plain object before returning — guards
 * against corrupted storage or stale migration shapes that would otherwise
 * crash callers doing things like `profile.medicalInfo.allergies`.
 */
export async function getUserProfile() {
  try {
    const raw = await AsyncStorage.getItem('roadsos_user_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persists the user profile to AsyncStorage.
 */
export async function saveUserProfile(profile: UserProfile) {
  try {
    await AsyncStorage.setItem('roadsos_user_profile', JSON.stringify(profile));
  } catch (e) {
    if (__DEV__) console.warn('Storage write failed', e);
  }
}

/**
 * Loads the list of emergency contacts from AsyncStorage.
 * Always returns an array — corrupted/non-array storage values become [] so
 * `contacts.length === 0` and `.map(...)` in callers stay safe.
 */
export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    const raw = await AsyncStorage.getItem('roadsos_emergency_contacts');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out any entries that don't match the expected shape — easier
    // than crashing on the SOS hot path because of one stale row.
    return parsed.filter((c): c is EmergencyContact =>
      c && typeof c === 'object' &&
      typeof c.id === 'string' &&
      typeof c.name === 'string' &&
      typeof c.phone === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Persists the emergency contacts list to AsyncStorage.
 */
export async function saveEmergencyContacts(contacts: EmergencyContact[]) {
  try {
    await AsyncStorage.setItem('roadsos_emergency_contacts', JSON.stringify(contacts));
  } catch (e) {
    if (__DEV__) console.warn('Storage write failed', e);
  }
}

/**
 * Saves an incident to the local cache (most recent 20 incidents).
 */
export async function saveIncident(incident: Incident) {
  try {
    const raw = await AsyncStorage.getItem('roadsos_incidents');
    const parsed = raw ? JSON.parse(raw) : [];
    const incidents: Incident[] = Array.isArray(parsed) ? parsed : [];
    const exists = incidents.some((i) => i.id === incident.id);
    if (exists) return;
    incidents.unshift(incident);
    await AsyncStorage.setItem('roadsos_incidents', JSON.stringify(incidents.slice(0, 20)));
  } catch (e) {
    if (__DEV__) console.warn('[offline-cache] saveIncident failed:', e);
  }
}

/**
 * Retrieves a specific incident by its ID from the local cache.
 */
export async function getIncident(id: string): Promise<Incident | null> {
  try {
    const raw = await AsyncStorage.getItem('roadsos_incidents');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return (parsed as Incident[]).find((i) => i && i.id === id) ?? null;
  } catch {
    return null;
  }
}
