import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canPublishCommunityStory, normalizeCommunityStory} from '../app/lib/community-story-policy.mjs';
test('history requires an active paid contract and fails closed for legacy/free/expired plans',()=>{
  for(const subscription of [null,undefined,{active:true,plan:{valor_centavos:0}},{active:false,plan:{valor_centavos:5000}},{active:true,plan:{valor_centavos:null}},{active:true}]) assert.equal(canPublishCommunityStory(subscription),false);
  assert.equal(canPublishCommunityStory({active:true,plan:{valor_centavos:5000}}),true);
});
test('history is private unless explicitly published and content is bounded',()=>{
  const story=normalizeCommunityStory({title:' a ',body:'x'.repeat(9000),mission:'y'.repeat(900),foundedYear:'2020',published:'true'});
  assert.equal(story.title,'a');assert.equal(story.body.length,8000);assert.equal(story.mission.length,600);assert.equal(story.foundedYear,'2020');assert.equal(story.published,false);
  assert.equal(normalizeCommunityStory({foundedYear:'bad'}).foundedYear,'');
});
