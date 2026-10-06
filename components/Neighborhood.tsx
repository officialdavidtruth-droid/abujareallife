'use client';
import CityWorld from './CityWorld';
import type { Look } from '../lib/characterModels';
export default function Neighborhood({look,onNear}:{look:Look;onNear:(dt:number)=>void}){return <CityWorld look={look} onNear={onNear}/>}
