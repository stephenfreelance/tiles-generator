// occt-import-js (dev dependency, OCCT 7.6) ships no type declarations; tests read our STEP back with it.
declare module 'occt-import-js' {
  export interface OcctMesh {
    name: string
    brep_faces: { first: number; last: number }[]
    attributes: { position: { array: number[] }; normal?: { array: number[] } }
    index: { array: number[] }
  }
  export interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }
  export interface OcctModule {
    ReadStepFile(content: Uint8Array, params: Record<string, unknown> | null): OcctResult
  }
  const factory: () => Promise<OcctModule>
  export default factory
}
