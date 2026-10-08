import assert from 'node:assert/strict';
import test from 'node:test';
import { loaderElement } from './tsxLoaderComponent.tsx';

test('a TypeScript test loads a transitive TSX component', () => {
  assert.equal(loaderElement.type, 'div');
  assert.equal(loaderElement.props.children, 'TSX loader regression');
});
