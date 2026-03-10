declare module 'ngeohash' {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function decode(hashstring: string): { latitude: number; longitude: number };
  export function neighbors(hashstring: string): string[];
  export function bboxes(
    minlat: number,
    minlon: number,
    maxlat: number,
    maxlon: number,
    precision?: number
  ): string[];
}
