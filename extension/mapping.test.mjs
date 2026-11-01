import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestField, validateBaseURL} from './mapping.mjs';

const profile = {fullName: 'Ian Chau', email: 'ian@example.test', phone: '+852 5555 0101', location: 'Hong Kong', website: 'https://example.test', linkedin: 'https://linkedin.com/in/example', addressCity: 'Hong Kong', addressZip: '00000'};
test('maps common labels and autocomplete while preserving supplied values', () => {
  for (const [field, expected] of [
    [{label:'First name'}, 'Ian'], [{name:'last_name'}, 'Chau'],
    [{label:'Name', name:'name', id:'name'}, 'Ian Chau'],
    [{autocomplete:'section-personal email'}, profile.email],
    [{type:'email'}, profile.email], [{label:'Mobile telephone'}, profile.phone],
    [{label:'LinkedIn URL'}, profile.linkedin], [{label:'Portfolio'}, profile.website],
    [{autocomplete:'address-level2'}, profile.addressCity], [{label:'Postal code'}, profile.addressZip],
  ]) assert.equal(suggestField(field,profile)?.value, expected);
});
test('does not invent missing data, credentials, eligibility or sensitive answers', () => {
  for (const label of ['Password', 'Social security number', 'SSN', 'Passport name', 'Emergency contact email', 'Supervisor email', 'Referrer name', 'Date of birth', 'Bank name', 'Credit card full name', 'Verification email', 'Company name', 'Why should we hire you?', 'Work authorization', 'Salary expectation']) {
    assert.equal(suggestField({label},profile),null,label);
  }
  assert.equal(suggestField({label:'First name'},{}),null);
  assert.equal(suggestField({label:'Last name'},{fullName:'Ian'}),null);
});
test('server pairing is limited to declared loopback origins', () => {
  assert.equal(validateBaseURL('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  assert.equal(validateBaseURL('http://localhost:3000/'),'http://localhost:3000');
  assert.equal(validateBaseURL('http://localhost:4000'),'http://localhost:4000');
  for (const url of ['https://example.com','http://localhost:3000/api','http://username:password@localhost:3000','http://localhost:3000/?x=1','http://localhost.evil.test:3000']) {
    assert.throws(() => validateBaseURL(url));
  }
});
