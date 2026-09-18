import { CourierAdapter } from "./CourierAdapter";
import { UrbaneBoltAdapter } from "./UrbaneBoltAdapter";
import { MockCourierAdapter } from "./MockCourierAdapter";
import { UnknownCourierError } from "../errors";

// The ONLY file touched to add a courier: instantiate + add to this map.
const registry: Record<string, CourierAdapter> = {
  urbanebolt: new UrbaneBoltAdapter(),
  mockcourier: new MockCourierAdapter(),
};

export function getCourier(name: string): CourierAdapter {
  const courier = registry[name?.toLowerCase()];
  if (!courier) throw new UnknownCourierError(name, Object.keys(registry));
  return courier;
}

export function supportedCouriers(): string[] {
  return Object.keys(registry);
}
