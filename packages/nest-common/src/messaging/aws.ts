export interface AwsConfig {
  AWS_REGION: string;
  /** Set locally to the moto emulator; unset on AWS. */
  AWS_ENDPOINT_URL?: string;
}

/** Client config for any AWS SDK v3 client; credentials come from the default provider chain. */
export function awsClientConfig(config: AwsConfig): { region: string; endpoint?: string } {
  return { region: config.AWS_REGION, ...(config.AWS_ENDPOINT_URL ? { endpoint: config.AWS_ENDPOINT_URL } : {}) };
}
