import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../lib/auth';
import { citySnapshot } from '../../../lib/livingCity';
export const dynamic='force-dynamic';
export async function GET(){const u=await currentUser();if(!u)return err('Not signed in.',401);return NextResponse.json(await citySnapshot(u.id));}
