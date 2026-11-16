// Stand-in for next/headers outside a request: cookies come from
// `__TEST_COOKIES` (run.ts sets them), headers are empty.
type Jar = Record<string, string>;
const jar = () => ((globalThis as { __TEST_COOKIES?: Jar }).__TEST_COOKIES ??= {});

export async function cookies() {
  return {
    get: (name: string) => (jar()[name] !== undefined ? { name, value: jar()[name] } : undefined),
    has: (name: string) => jar()[name] !== undefined,
    set: (name: string, value: string) => {
      jar()[name] = value;
    },
    delete: (name: string) => {
      delete jar()[name];
    },
  };
}

export async function headers() {
  return new Headers();
}
