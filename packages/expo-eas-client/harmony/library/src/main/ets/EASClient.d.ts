declare module 'libexpo_eas_client.so' {
  const client: {
    clientID(path: string): string | undefined;
    clientID(path: string, candidate: string): string;
  };

  export default client;
}
