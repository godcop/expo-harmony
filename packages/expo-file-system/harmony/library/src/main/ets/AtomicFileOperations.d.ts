declare module 'libexpo_file_system_atomic.so' {
  const atomic: {
    exclusiveCreate(path: string): void;
    publishNoReplace(source: string, target: string): void;
  };

  export default atomic;
}
