export async function retry<T>(label: string, fn: () => Promise<T>, attempts = 40): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      console.log(`${label} not ready (${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw last;
}
