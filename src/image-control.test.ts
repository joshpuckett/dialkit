import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageLabel, imageOptions } from './image-control';
import { DialStore, flattenDialValueUpdates, resolveDialValues, type DialConfig, type ResolvedValues } from './store/DialStore';

describe('image controls', () => {
  it('resolves URL, labeled, explicit, nested, and upload-only image values as strings', () => {
    const config = {
      cover: { type: 'image', options: ['/coast.jpg', '/forest.jpg'] },
      labeled: { type: 'image', options: [{ value: '/avatar.png', label: 'Avatar' }] },
      explicit: { type: 'image', default: '/custom.webp', options: ['/coast.jpg'] },
      empty: { type: 'image' },
      profile: { avatar: { type: 'image', default: '', options: ['/avatar.png'] } },
    } satisfies DialConfig;
    const resolved: ResolvedValues<typeof config> = resolveDialValues(config, {});
    const cover: string = resolved.cover;
    assert.equal(cover, '/coast.jpg');
    assert.deepEqual(resolved, { cover: '/coast.jpg', labeled: '/avatar.png', explicit: '/custom.webp', empty: '', profile: { avatar: '' } });
    const id = 'image-defaults';
    try {
      DialStore.registerPanel(id, 'Images', config);
      assert.deepEqual(DialStore.getPanel(id)!.controls.map(control => control.type), ['image', 'image', 'image', 'image', 'folder']);
      assert.deepEqual(DialStore.getPanel(id)!.controls[0].options, config.cover.options);
      assert.deepEqual(resolveDialValues(config, DialStore.getValues(id)), resolved);
      assert.deepEqual(flattenDialValueUpdates(config, { cover: '/forest.jpg', profile: { avatar: 'data:image/png;base64,example' } }), {
        cover: '/forest.jpg', 'profile.avatar': 'data:image/png;base64,example',
      });
    } finally { DialStore.unregisterPanel(id); }
  });

  it('preserves uploaded values through config changes and presets, then resets to its initial version', () => {
    const id = 'image-presets';
    const config = { cover: { type: 'image', options: ['/coast.jpg', '/forest.jpg'] } } satisfies DialConfig;
    const uploaded = 'data:image/png;base64,uploaded';
    try {
      DialStore.registerPanel(id, 'Images', config);
      DialStore.updateValues(id, flattenDialValueUpdates(config, { cover: uploaded }));
      const preset = DialStore.savePreset(id, 'Custom cover');
      DialStore.clearActivePreset(id);
      DialStore.updateValue(id, 'cover', '/forest.jpg');
      DialStore.loadPreset(id, preset);
      assert.equal(DialStore.getValue(id, 'cover'), uploaded);
      DialStore.updatePanel(id, 'Images', { cover: { type: 'image', options: ['/new.jpg'] } });
      assert.equal(DialStore.getValue(id, 'cover'), uploaded);
      DialStore.updateValue(id, 'cover', '');
      DialStore.updatePanel(id, 'Images', config);
      assert.equal(DialStore.getValue(id, 'cover'), '');
      DialStore.resetValues(id);
      assert.equal(DialStore.getValue(id, 'cover'), uploaded);
    } finally { DialStore.unregisterPanel(id); }
  });

  it('includes restored images without duplicates and keeps supplied labels', () => {
    const upload = { value: 'data:image/png;base64,example', label: 'My avatar.png' };
    assert.deepEqual(imageOptions([{ value: '/coast.jpg', label: 'Coast' }, '/coast.jpg', ''], [upload], '/custom.png'), [
      { value: '/coast.jpg', label: 'Coast' }, upload, { value: '/custom.png', label: 'custom.png' },
    ]);
    assert.deepEqual(imageOptions([], [upload], upload.value), [upload]);
    assert.deepEqual(imageOptions(), []);
    assert.equal(imageLabel('/photos/My%20photo.jpg?width=400#preview'), 'My photo.jpg');
    assert.equal(imageLabel('/invalid%name.png'), 'invalid%name.png');
    assert.equal(imageLabel(upload.value), 'Uploaded image');
  });
});
