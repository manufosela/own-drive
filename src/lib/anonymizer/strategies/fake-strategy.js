/**
 * Fake data generation strategy using @faker-js/faker.
 * Only imports the specific modules needed to minimize bundle size.
 *
 * @module anonymizer/strategies/fake-strategy
 */

import { fakerES as faker } from '@faker-js/faker';

/**
 * NIF letter calculation table.
 * @type {string}
 */
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Generate a fake Spanish NIF (DNI number + letter).
 * @returns {string}
 */
function generateNif() {
  const num = Math.floor(Math.random() * 100000000);
  const letter = NIF_LETTERS[num % 23];
  return String(num).padStart(8, '0') + letter;
}

/**
 * Generate a fake value based on the specified faker type.
 *
 * @param {'name'|'email'|'phone'|'nif'|'address'|'company'|'text'} fakerType
 * @returns {string}
 */
export function fakeValue(fakerType) {
  switch (fakerType) {
    case 'name':
      return faker.person.fullName();
    case 'email':
      return faker.internet.email();
    case 'phone':
      return faker.phone.number({ style: 'national' });
    case 'nif':
      return generateNif();
    case 'address':
      return faker.location.streetAddress();
    case 'company':
      return faker.company.name();
    case 'text':
      return faker.lorem.sentence();
    default:
      return faker.string.alphanumeric(10);
  }
}
