/** An API call that failed, with the server's message and HTTP status. Thrown by `call` in rpc.ts. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
