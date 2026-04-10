type CorsOriginOption = boolean | string | RegExp | Array<string | RegExp> | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);

function parseOriginList(value: string): Array<string | RegExp> {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === '*') {
        return /.*/;
      }

      if (origin.startsWith('/') && origin.endsWith('/')) {
        return new RegExp(origin.slice(1, -1));
      }

      return origin;
    });
}

export function getCorsOriginOption(defaultAllowAll = true): CorsOriginOption {
  const configuredOrigin = process.env.CORS_ORIGIN?.trim();

  if (configuredOrigin) {
    const origins = parseOriginList(configuredOrigin);
    return origins.length === 1 ? origins[0] : origins;
  }

  if (defaultAllowAll) {
    return true;
  }

  return ['http://localhost:3001', 'http://127.0.0.1:3001'];
}
