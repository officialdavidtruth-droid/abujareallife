export type VehicleBrand = 'Toyota' | 'Lexus' | 'Mercedes-Benz' | 'BMW' | 'Honda' | 'Land Rover' | 'Porsche' | 'Alfa Romeo' | 'Yamaha' | 'Trek' | 'Giant' | 'Robinson' | 'Bell' | 'Yamaha Boats' | 'Bayliner' | 'Abuja Rail';
export type VehicleSpec = { id: string; brand: VehicleBrand; model: string; year: number; price: number; type: 'CAR' | 'SUV' | 'MOTORCYCLE' | 'BICYCLE' | 'HELICOPTER' | 'BOAT' | 'TRAIN' | 'BUS'; topSpeed: number; accel: number; handling: number; color: string };

export const VEHICLE_CATALOG: VehicleSpec[] = [
  { id: 'toyota-camry-2024', brand: 'Toyota', model: 'Camry', year: 2024, price: 18_500_000, type: 'CAR', topSpeed: 210, accel: 7.9, handling: 78, color: '#c9c9c9' },
  { id: 'toyota-corolla-2024', brand: 'Toyota', model: 'Corolla', year: 2024, price: 14_800_000, type: 'CAR', topSpeed: 195, accel: 9.1, handling: 80, color: '#f2f2f2' },
  { id: 'lexus-es-2024', brand: 'Lexus', model: 'ES 350', year: 2024, price: 29_500_000, type: 'CAR', topSpeed: 210, accel: 6.8, handling: 84, color: '#1d2730' },
  { id: 'mercedes-c200-2024', brand: 'Mercedes-Benz', model: 'C 200', year: 2024, price: 42_000_000, type: 'CAR', topSpeed: 246, accel: 7.3, handling: 87, color: '#17202a' },
  { id: 'bmw-530i-2024', brand: 'BMW', model: '530i', year: 2024, price: 48_000_000, type: 'CAR', topSpeed: 250, accel: 6.1, handling: 89, color: '#243b5a' },
  { id: 'honda-accord-2024', brand: 'Honda', model: 'Accord', year: 2024, price: 20_500_000, type: 'CAR', topSpeed: 200, accel: 7.8, handling: 81, color: '#d7d7d7' },
  { id: 'land-rover-discovery-2024', brand: 'Land Rover', model: 'Discovery', year: 2024, price: 58_000_000, type: 'SUV', topSpeed: 209, accel: 7.5, handling: 76, color: '#34443d' },
  { id: 'lexus-lx-2024', brand: 'Lexus', model: 'LX', year: 2024, price: 92_000_000, type: 'SUV', topSpeed: 210, accel: 7.7, handling: 74, color: '#151515' },
  { id: 'porsche-911-carrera-4s-2024', brand: 'Porsche', model: '911 Carrera 4S', year: 2024, price: 185_000_000, type: 'CAR', topSpeed: 308, accel: 3.4, handling: 96, color: '#c9c9c9' },
  { id: 'alfa-romeo-stradale-1967', brand: 'Alfa Romeo', model: '33 Stradale', year: 1967, price: 260_000_000, type: 'CAR', topSpeed: 260, accel: 5.5, handling: 90, color: '#9b1c1c' },
  // Step 1: motorcycles. Keep this first vehicle expansion small before adding bicycles, aircraft, boats, trains and damage.
  { id: 'honda-cb500f-2024', brand: 'Honda', model: 'CB500F Motorcycle', year: 2024, price: 4_800_000, type: 'MOTORCYCLE', topSpeed: 180, accel: 4.8, handling: 88, color: '#d71920' },
  { id: 'yamaha-mt07-2024', brand: 'Yamaha', model: 'MT-07 Motorcycle', year: 2024, price: 7_200_000, type: 'MOTORCYCLE', topSpeed: 214, accel: 3.8, handling: 91, color: '#20252b' },
  // Step 2: bicycles are separate vehicle types and use their own procedural model.
  { id: 'trek-marlin-7-2024', brand: 'Trek', model: 'Marlin 7 Mountain Bicycle', year: 2024, price: 650_000, type: 'BICYCLE', topSpeed: 45, accel: 5.2, handling: 94, color: '#d71920' },
  { id: 'giant-escape-3-2024', brand: 'Giant', model: 'Escape 3 City Bicycle', year: 2024, price: 420_000, type: 'BICYCLE', topSpeed: 35, accel: 4.5, handling: 96, color: '#1769aa' },
  // Step 8: helicopters are catalogued and the airport helicopter has a playable flight loop; multiplayer aircraft replication remains separate work.
  { id: 'robinson-r44-2024', brand: 'Robinson', model: 'R44 Raven II Helicopter', year: 2024, price: 185_000_000, type: 'HELICOPTER', topSpeed: 240, accel: 4.2, handling: 70, color: '#f0f0e8' },
  { id: 'bell-407-2024', brand: 'Bell', model: '407 Utility Helicopter', year: 2024, price: 420_000_000, type: 'HELICOPTER', topSpeed: 260, accel: 3.8, handling: 74, color: '#d9a52e' },
  // Step 4: boats are catalogued and rendered separately; water movement and docking are a later gameplay milestone.
  { id: 'yamaha-242x-2024', brand: 'Yamaha Boats', model: '242X Sport Boat', year: 2024, price: 68_000_000, type: 'BOAT', topSpeed: 85, accel: 5.5, handling: 82, color: '#f4f4f0' },
  { id: 'bayliner-vr5-2024', brand: 'Bayliner', model: 'VR5 Bowrider', year: 2024, price: 42_000_000, type: 'BOAT', topSpeed: 70, accel: 6.2, handling: 78, color: '#173e63' },
  // Step 5: train rolling-stock catalogue and visual model. Passenger routes, rails, stations and boarding remain separate gameplay work.
  { id: 'abuja-rail-electric-locomotive-2026', brand: 'Abuja Rail', model: 'Electric Locomotive', year: 2026, price: 1_850_000_000, type: 'TRAIN', topSpeed: 160, accel: 2.4, handling: 60, color: '#173e63' },
  { id: 'abuja-rail-passenger-carriage-2026', brand: 'Abuja Rail', model: 'Passenger Carriage', year: 2026, price: 320_000_000, type: 'TRAIN', topSpeed: 160, accel: 2.4, handling: 60, color: '#f1f1ec' },
];
export const vehicleById = (id: string) => VEHICLE_CATALOG.find(v => v.id === id) || VEHICLE_CATALOG[0];
export const vehicleByName = (name: string) => VEHICLE_CATALOG.find(v => `${v.brand} ${v.model}`.toLowerCase() === name.toLowerCase()) || VEHICLE_CATALOG[0];
