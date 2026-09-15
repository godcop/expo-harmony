declare const clientIdentityStore: {
  clientID(path: string): string | undefined;
  clientID(path: string, candidate: string): string;
};

export default clientIdentityStore;
