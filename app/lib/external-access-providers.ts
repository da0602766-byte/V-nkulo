// Integration boundaries. No provider is active until an implementation is configured.
// Payment confirmations must be verified by the provider and deduplicated before activation.
export type VerifiedPayment = {provider:string;eventId:string;requestId:number;amountCents:number;currency:'BRL';status:'CONFIRMED'|'FAILED'|'REFUNDED'};
export interface PaymentProvider {
  createCheckout(input:{requestId:number;amountCents:number;currency:'BRL';returnUrl:string}):Promise<{url:string;externalId:string}>;
  verifyWebhook(rawBody:string,headers:Headers):Promise<VerifiedPayment>;
}
export interface OwnerSecondFactorProvider {
  createChallenge(userId:number,sessionId:string):Promise<{challengeId:string;expiresAt:string}>;
  verifyChallenge(userId:number,challengeId:string,proof:string):Promise<boolean>;
}
export const configuredPaymentProvider:PaymentProvider|null=null;
export const configuredOwnerSecondFactor:OwnerSecondFactorProvider|null=null;
