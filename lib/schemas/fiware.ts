import { z } from "zod";

/**
 * Zod schemas for FIWARE Urban Platform API responses.
 *
 * FIWARE entities have inconsistent schemas — some fields are nested
 * in { value: ... } wrappers, some are flat. The schema validates the
 * structure; the unwrap helper extracts the actual value.
 */

// Helper: accept either { value: T } or T directly
const fiwareValue = <T extends z.ZodType>(schema: T) =>
  z.union([z.object({ value: schema }), schema]);

/**
 * Extract the actual value from a FIWARE field that may be wrapped in { value: T }.
 * Usage: unwrap(entity.speed) → number | undefined
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap<T>(val: T | { value: T } | undefined | null): T | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "object" && val !== null && "value" in val) {
    return (val as { value: T }).value;
  }
  return val as T;
}

/**
 * Extract annotations array from FIWARE entity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrapAnnotations(val: any): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) return val;
  if (val.value && Array.isArray(val.value)) return val.value;
  return undefined;
}

// Location can come in two formats
const FiwareLocationSchema = z.union([
  z.object({
    type: z.string().optional(),
    value: z.object({
      type: z.string().optional(),
      coordinates: z.tuple([z.number(), z.number()]),
    }),
  }),
  z.object({
    type: z.string().optional(),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
]);

/**
 * Extract coordinates from a validated FIWARE location field.
 */
export function unwrapLocation(
  loc: z.infer<typeof FiwareLocationSchema>
): [number, number] {
  if ("value" in loc) return loc.value.coordinates;
  return loc.coordinates;
}

// A single FIWARE Vehicle entity
export const FiwareVehicleEntitySchema = z
  .object({
    id: z.string(),
    type: z.string(),
    location: FiwareLocationSchema,
    routeShortName: fiwareValue(z.string()).optional(),
    route: fiwareValue(z.string()).optional(),
    lineId: fiwareValue(z.string()).optional(),
    line: fiwareValue(z.string()).optional(),
    routeLongName: fiwareValue(z.string()).optional(),
    destination: fiwareValue(z.string()).optional(),
    tripHeadsign: fiwareValue(z.string()).optional(),
    headsign: fiwareValue(z.string()).optional(),
    direction: fiwareValue(z.string()).optional(),
    directionId: fiwareValue(z.string()).optional(),
    vehiclePlateIdentifier: fiwareValue(z.string()).optional(),
    vehicleNumber: fiwareValue(z.string()).optional(),
    license_plate: fiwareValue(z.string()).optional(),
    name: fiwareValue(z.string()).optional(),
    heading: fiwareValue(z.number()).optional(),
    bearing: fiwareValue(z.number()).optional(),
    speed: fiwareValue(z.number()).optional(),
    dateModified: fiwareValue(z.string()).optional(),
    timestamp: fiwareValue(z.string()).optional(),
    annotations: fiwareValue(z.array(z.string())).optional(),
  })
  .passthrough();

// The full FIWARE response is an array of entities
export const FiwareVehiclesResponseSchema = z.array(FiwareVehicleEntitySchema);

export type FiwareVehicleEntity = z.infer<typeof FiwareVehicleEntitySchema>;
