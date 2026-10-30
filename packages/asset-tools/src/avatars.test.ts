import { Document, NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { extractRig, splitCharacter, classifyPart } from './avatars';
import { pickClips } from './build';

describe('classifyPart', () => {
  it.each([
    ['Suit_Head', 'head'],
    ['Formad_Head', 'head'],
    ['Casual2_Body', 'body'],
    ['Farmer_Pants', 'legs'],
    ['Witch_Legs', 'legs'],
    ['Punk_Feet', 'feet'],
  ])('%s is %s', (name, slot) => expect(classifyPart(name)).toBe(slot));

  it.each(['Sword', 'Pistol', 'Backpack'])('leaves accessory %s out', (name) => {
    expect(classifyPart(name)).toBeUndefined();
  });
});

describe('pickClips', () => {
  it('finds the plain idle, walk and run clips', () => {
    const names = [
      'CharacterArmature|Idle_Gun',
      'CharacterArmature|Idle',
      'CharacterArmature|Run_Back',
      'CharacterArmature|Run',
      'CharacterArmature|Walk',
    ];
    expect(pickClips(names)).toEqual({
      idle: 'CharacterArmature|Idle',
      walk: 'CharacterArmature|Walk',
      run: 'CharacterArmature|Run',
    });
  });

  it('works with the other pack naming', () => {
    expect(
      pickClips(['HumanArmature|Man_Idle', 'HumanArmature|Man_Walk', 'HumanArmature|Man_Run']).walk,
    ).toBe('HumanArmature|Man_Walk');
  });

  it('says which clips exist when one is missing', () => {
    expect(() => pickClips(['Dance'])).toThrow(/no "idle" clip/);
  });
});

/** A two-part skinned character on a three-bone skeleton, with one animation. */
async function fakeCharacter(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.createNode('Hips');
  const spine = doc.createNode('Spine').setTranslation([0, 1, 0]);
  const head = doc.createNode('Head').setTranslation([0, 1, 0]);
  root.addChild(spine);
  spine.addChild(head);

  const ibm = doc
    .createAccessor()
    .setType('MAT4')
    .setBuffer(buffer)
    .setArray(
      new Float32Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1,
        0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2, 0, 1,
      ]),
    );
  const skin = doc
    .createSkin()
    .addJoint(root)
    .addJoint(spine)
    .addJoint(head)
    .setInverseBindMatrices(ibm);

  const makeMesh = (name: string) => {
    const prim = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc
          .createAccessor()
          .setType('VEC3')
          .setBuffer(buffer)
          .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
      )
      .setAttribute(
        'JOINTS_0',
        doc
          .createAccessor()
          .setType('VEC4')
          .setBuffer(buffer)
          .setArray(new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0])),
      )
      .setAttribute(
        'WEIGHTS_0',
        doc
          .createAccessor()
          .setType('VEC4')
          .setBuffer(buffer)
          .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])),
      );
    return doc.createMesh(name).addPrimitive(prim);
  };
  const scene = doc.createScene().addChild(root);
  scene.addChild(doc.createNode('headNode').setMesh(makeMesh('Fake_Head')).setSkin(skin));
  scene.addChild(doc.createNode('bodyNode').setMesh(makeMesh('Fake_Body')).setSkin(skin));
  scene.addChild(doc.createNode('swordNode').setMesh(makeMesh('Sword')).setSkin(skin));

  const times = doc
    .createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 1]));
  const values = doc
    .createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 0, 1, 0]));
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(values);
  const channel = doc
    .createAnimationChannel()
    .setTargetNode(root)
    .setTargetPath('translation')
    .setSampler(sampler);
  doc.createAnimation('Idle').addSampler(sampler).addChannel(channel);
  return new NodeIO().writeBinary(doc);
}

describe('splitCharacter', () => {
  it('makes one file per slot, with only that mesh and no animation', async () => {
    const { parts, skipped } = await splitCharacter(await fakeCharacter());
    expect(Object.keys(parts).sort()).toEqual(['body', 'head']);
    expect(skipped).toEqual(['Sword']);

    const head = await new NodeIO().readBinary(parts.head!);
    expect(
      head
        .getRoot()
        .listMeshes()
        .map((m) => m.getName()),
    ).toEqual(['Fake_Head']);
    expect(head.getRoot().listAnimations()).toHaveLength(0);
    expect(
      head
        .getRoot()
        .listSkins()[0]
        ?.listJoints()
        .map((j) => j.getName()),
    ).toEqual(['Hips', 'Spine', 'Head']);
  });
});

describe('extractRig', () => {
  it('keeps every joint and the animation, and drops the meshes', async () => {
    const rig = await new NodeIO().readBinary(await extractRig(await fakeCharacter()));
    expect(rig.getRoot().listMeshes()).toHaveLength(0);
    expect(
      rig
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['Idle']);
    const names = rig
      .getRoot()
      .listNodes()
      .map((n) => n.getName());
    expect(names).toEqual(expect.arrayContaining(['Hips', 'Spine', 'Head']));
  });
});
