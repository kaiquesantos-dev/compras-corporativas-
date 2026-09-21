import { isValidCnpj } from './is-cnpj.validator';

describe('isValidCnpj', () => {
  it('accepts a real, valid CNPJ (formatted or plain digits)', () => {
    expect(isValidCnpj('19.131.243/0001-97')).toBe(true);
    expect(isValidCnpj('19131243000197')).toBe(true);
  });

  it('rejects a value with the wrong length', () => {
    expect(isValidCnpj('123')).toBe(false);
  });

  it('rejects a CNPJ made of all repeated digits', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('rejects a CNPJ with a wrong check digit', () => {
    expect(isValidCnpj('19131243000198')).toBe(false);
  });

  it('accepts the second known-valid CNPJ used across the test suite', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });
});
