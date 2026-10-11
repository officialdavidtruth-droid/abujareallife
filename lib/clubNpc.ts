/* Club NPCs you can walk up to and talk to (step 1). Shared by the 3D scene (Interior) and the talk panel (ClubTalk). */
export type ClubPerson = { idx: number; name: string; role: string; e: string; escort?: boolean; price?: number; greet: string[]; chat: string[]; club: string[] };
export const CLUB_PEOPLE: ClubPerson[] = [
  { idx: 0, name: 'Zara', role: 'VIP Hostess', e: '💋', greet: ['Welcome. Dress sharp, behave well, and the night is yours.'], chat: ['VIP gets busy after midnight. Be polite to the bouncer and he will remember you.', 'I know every name on the guest list. Mine is always at the top.'], club: ['The lounge is for people the bouncer trusts. Earn a reputation first.'] },
  { idx: 1, name: 'Mimi', role: 'Dance-floor Regular', e: '💃', greet: ['Heyy! Are you here to dance or to watch?'], chat: ['Afrobeats is life. Come, even bad dancers are welcome here.', 'The DJ drops the best songs after eleven. Do not leave early.'], club: ['The dance floor is the middle of the room. Nobody cares how you move, just move.'] },
  { idx: 2, name: 'Naya', role: 'Private-table Hostess', e: '🪩', greet: ['Mm. You look like someone who knows how to speak to a lady.'], chat: ['I am selective about who I talk to. You are doing fine so far.', 'Private tables are quiet. That is exactly why people pay for them.'], club: ['Ask the bouncer about the lounge rules before you walk up to the private tables.'] },
  { idx: 3, name: 'Tee', role: 'Nightlife Promoter', e: '✨', greet: ['My person! You have to see the event board, big nights are coming.'], chat: ['I know everybody. Tell me what you are into and I will point you to the right party.', 'Parties, crews, racing, I can connect you.'], club: ['Check the event board for themed nights and new faces.'] },
  { idx: 4, name: 'Amara', role: 'Lounge Companion', e: '🥂', greet: ['Hi there. Sit, relax. Tell me about your day.'], chat: ['Keep it respectful. Everyone here can say no, and boundaries are part of the night.', 'I like a good conversation more than a loud one.'], club: ['The lounge is calm. Good for talking, bad for rushing.'] },
  { idx: 5, name: 'Chi', role: 'Companion for hire', e: '💋', escort: true, price: 60_000, greet: ['Hey you. I noticed you looking. Want some company tonight?'], chat: ['I work here, and I choose who I spend my time with. Be nice and we will get along.', 'It is a long night. A little company makes it better.'], club: ['Everything is agreed up front. No surprises, no pressure. I can say no at any time and so can you.'] },
  { idx: 6, name: 'Lola', role: 'Companion for hire', e: '💋', escort: true, price: 90_000, greet: ['Well hello. You have good taste, you came to my corner.'], chat: ['I am not cheap, but I am worth it. Ask anyone.', 'Buy me a drink first and let us see where the conversation goes.'], club: ['I keep my evenings private. If we agree, we leave together and discreetly.'] },
];
export const clubPerson = (idx: number) => CLUB_PEOPLE.find(p => p.idx === idx) || null;
/* live positions written by the 3D scene every frame, and who the player is currently talking to (that NPC stops dancing and faces you) */
export const CLUB_REG: Record<number, { x: number; z: number }> = {};
export const CLUB_TALK = { idx: -1 };
export const TALK_RANGE = 3.2;

/* Step 2: the companion you paid. She follows you inside the club; when you walk out she goes with you ('outside' is picked up by the next step). */
export const COMPANION = { idx: -1, name: '', phase: 'none' as 'none' | 'inside' | 'outside' };
export const endCompanion = () => { COMPANION.idx = -1; COMPANION.name = ''; COMPANION.phase = 'none'; };
