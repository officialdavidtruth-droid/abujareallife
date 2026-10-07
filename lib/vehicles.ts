export type VehicleBrand = 'Toyota' | 'Lexus' | 'Mercedes-Benz' | 'BMW' | 'Honda' | 'Land Rover';
export type VehicleSpec = { id: string; brand: VehicleBrand; model: string; year: number; price: number; type: 'CAR' | 'SUV'; topSpeed: number; accel: number; handling: number; color: string };

export const VEHICLE_CATALOG: VehicleSpec[] = [
  { id: 'toyota-camry-2024', brand: 'Toyota', model: 'Camry', year: 2024, price: 18_500_000, type: 'CAR', topSpeed: 210, accel: 7.9, handling: 78, color: '#c9c9c9' },
  { id: 'toyota-corolla-2024', brand: 'Toyota', model: 'Corolla', year: 2024, price: 14_800_000, type: 'CAR', topSpeed: 195, accel: 9.1, handling: 80, color: '#f2f2f2' },
  { id: 'lexus-es-2024', brand: 'Lexus', model: 'ES 350', year: 2024, price: 29_500_000, type: 'CAR', topSpeed: 210, accel: 6.8, handling: 84, color: '#1d2730' },
  { id: 'mercedes-c200-2024', brand: 'Mercedes-Benz', model: 'C 200', year: 2024, price: 42_000_000, type: 'CAR', topSpeed: 246, accel: 7.3, handling: 87, color: '#17202a' },
  { id: 'bmw-530i-2024', brand: 'BMW', model: '530i', year: 2024, price: 48_000_000, type: 'CAR', topSpeed: 250, accel: 6.1, handling: 89, color: '#243b5a' },
  { id: 'honda-accord-2024', brand: 'Honda', model: 'Accord', year: 2024, price: 20_500_000, type: 'CAR', topSpeed: 200, accel: 7.8, handling: 81, color: '#d7d7d7' },
  { id: 'land-rover-discovery-2024', brand: 'Land Rover', model: 'Discovery', year: 2024, price: 58_000_000, type: 'SUV', topSpeed: 209, accel: 7.5, handling: 76, color: '#34443d' },
  { id: 'lexus-lx-2024', brand: 'Lexus', model: 'LX', year: 2024, price: 92_000_000, type: 'SUV', topSpeed: 210, accel: 7.7, handling: 74, color: '#151515' },
];
export const vehicleById = (id: string) => VEHICLE_CATALOG.find(v => v.id === id) || VEHICLE_CATALOG[0];
export const vehicleByName = (name: string) => VEHICLE_CATALOG.find(v => `${v.brand} ${v.model}`.toLowerCase() === name.toLowerCase()) || VEHICLE_CATALOG[0];
