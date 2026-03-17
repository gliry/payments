import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ALL_CHAINS, GATEWAY_CHAINS } from '../../circle/config/chains';

export function IsChain(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isChain',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a supported chain: ${Object.keys(ALL_CHAINS).join(', ')}`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && value in ALL_CHAINS;
        },
      },
    });
  };
}

export function IsGatewayChain(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGatewayChain',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a Gateway-supported chain: ${Object.keys(GATEWAY_CHAINS).join(', ')}`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && value in GATEWAY_CHAINS;
        },
      },
    });
  };
}

export function IsEvmAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEvmAddress',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid EVM address (0x + 40 hex chars)`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
        },
      },
    });
  };
}

export function IsTokenAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTokenAmount',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a positive decimal number (up to 6 decimal places)`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && /^\d+(\.\d{1,6})?$/.test(value) && parseFloat(value) > 0;
        },
      },
    });
  };
}
