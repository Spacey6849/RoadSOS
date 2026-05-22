export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type Language = 'English' | 'Hindi' | 'Tamil' | 'Telugu' | 'Kannada' | 'Malayalam' | 'Marathi';
export type ServiceType = 'hospital' | 'trauma_centre' | 'ambulance' | 'police' | 'towing' | 'puncture' | 'showroom';
export type CrashSensitivity = 'low' | 'medium' | 'high';
export type AppStatus = 'online' | 'offline' | 'ai-offline';

export interface MedicalInfo {
  allergies: string;
  medications: string;
  conditions: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

export interface UserProfile {
  name: string;
  bloodGroup: BloodGroup;
  language: Language;
  medicalInfo?: MedicalInfo;
  crashDetectionEnabled: boolean;
  crashSensitivity: CrashSensitivity;
  devMode: boolean;
  onboardingComplete: boolean;
  batteryOptimization?: boolean;
}

export interface NearbyService {
  id: string;
  name: string;
  service_type: ServiceType;
  address: string;
  primary_phone: string;
  is_24x7: boolean;
  tags: Record<string, unknown>;
  distance_km: number;
  lat: number;
  lng: number;
}

export interface LocationData {
  lat: number;
  lng: number;
  address?: string;
  accuracy?: number;
  timestamp: number;
}

export interface SMSStatus {
  contactId: string;
  name: string;
  phone: string;
  deviceSent: boolean;
  backupSent: boolean;
  error?: string;
}

export interface Incident {
  id: string;
  triggerType: 'auto' | 'manual';
  location?: LocationData;
  services: NearbyService[];
  smsStatuses: SMSStatus[];
  createdAt: number;
  user_name?: string;
  blood_group?: string;
  status?: string;
}

export interface Responder {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  updatedAt: number;
}

/* A crash detected by the mobile app's accelerometer, logged to `crash_logs`.
   `resolved` flips to true when a responder clears it from the dashboard. */
export interface CrashLog {
  id: string;
  detectedAt: number;
  devicePlatform: string;
  mode: string;
  sensitivity: string;
  gForce: number;
  jerkGs: number;
  location?: { lat: number; lng: number };
  address?: string;
  outcome?: string;
  resolved: boolean;
  resolvedAt?: number;
}
