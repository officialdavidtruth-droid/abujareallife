import { VehicleType } from '@prisma/client';
import { VEHICLE_CATALOG, ROAD_TRAFFIC_CATALOG } from '../lib/vehicles';

const enumTypes = new Set<string>(Object.values(VehicleType));
const roadTypes = new Set<string>(['CAR', 'SUV', 'BUS', 'MOTORCYCLE']);
const ids = new Set<string>();
const errors: string[] = [];

for (const vehicle of VEHICLE_CATALOG) {
  if (ids.has(vehicle.id)) errors.push(`Duplicate vehicle id: ${vehicle.id}`);
  ids.add(vehicle.id);
  if (!enumTypes.has(vehicle.type)) errors.push(`${vehicle.id} uses unsupported Prisma VehicleType ${vehicle.type}`);
  if (!Number.isFinite(vehicle.price) || vehicle.price < 0) errors.push(`${vehicle.id} has an invalid price`);
  if (!Number.isFinite(vehicle.topSpeed) || vehicle.topSpeed <= 0) errors.push(`${vehicle.id} has an invalid top speed`);
}

for (const vehicle of ROAD_TRAFFIC_CATALOG) {
  if (!roadTypes.has(vehicle.type)) {
    errors.push(`Non-road vehicle ${vehicle.id} was included in road traffic`);
  }
}

for (const required of ['CAR', 'SUV', 'MOTORCYCLE', 'BICYCLE', 'HELICOPTER', 'BOAT', 'TRAIN', 'BUS']) {
  if (!enumTypes.has(required)) errors.push(`Prisma VehicleType is missing ${required}`);
  if (!VEHICLE_CATALOG.some(v => v.type === required)) errors.push(`Vehicle catalogue has no ${required} entry`);
}

if (errors.length) {
  console.error('Vehicle consistency check failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log(`Vehicle consistency check passed: ${VEHICLE_CATALOG.length} catalogue entries, ${ROAD_TRAFFIC_CATALOG.length} road-traffic entries, ${enumTypes.size} Prisma vehicle types.`);
