export function isGatewayReady(params: {
  users: boolean | 'unknown';
  auth: boolean | 'unknown';
}): boolean {
  return params.users === true && params.auth === true;
}
