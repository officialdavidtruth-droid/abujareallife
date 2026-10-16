'use client';
import * as THREE from 'three';

/**
 * Detailed, low-cost supermarket stock props.
 * These are assembled from shaded meshes rather than flat coloured cubes:
 * beverage bottles with necks/caps/labels, cans with metallic rims, cartons,
 * cereal boxes and produce baskets. Instancing is deliberately avoided here
 * so each item can have distinct proportions and trim.
 */
function Bottle({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, .14, 0]} castShadow><cylinderGeometry args={[.075, .09, .28, 12]} /><meshStandardMaterial color={color} roughness={.22} metalness={.05} /></mesh>
    <mesh position={[0, .31, 0]} castShadow><cylinderGeometry args={[.043, .065, .09, 12]} /><meshStandardMaterial color={color} roughness={.25} /></mesh>
    <mesh position={[0, .37, 0]} castShadow><cylinderGeometry args={[.045, .045, .035, 12]} /><meshStandardMaterial color="#e9e5da" roughness={.35} /></mesh>
    <mesh position={[0, .15, .078]}><boxGeometry args={[.085, .105, .008]} /><meshStandardMaterial color="#f5f0df" roughness={.65} /></mesh>
  </group>;
}
function Can({ position, color }: { position: [number, number, number]; color: string }) {
  return <group position={position}>
    <mesh position={[0, .105, 0]} castShadow><cylinderGeometry args={[.062, .062, .21, 16]} /><meshStandardMaterial color={color} roughness={.28} metalness={.42} /></mesh>
    <mesh position={[0, .215, 0]}><cylinderGeometry args={[.058, .058, .012, 16]} /><meshStandardMaterial color="#c7c9c7" metalness={.75} roughness={.22} /></mesh>
    <mesh position={[0, .11, .063]}><boxGeometry args={[.047, .075, .004]} /><meshStandardMaterial color="#f6f2e8" roughness={.7} /></mesh>
  </group>;
}
function Carton({ position, color, tall = false }: { position: [number, number, number]; color: string; tall?: boolean }) {
  const h = tall ? .32 : .23;
  return <group position={position}>
    <mesh position={[0, h / 2, 0]} castShadow><boxGeometry args={[.17, h, .13]} /><meshStandardMaterial color={color} roughness={.72} /></mesh>
    <mesh position={[0, h + .008, 0]}><boxGeometry args={[.12, .018, .1]} /><meshStandardMaterial color="#e7dfcc" roughness={.65} /></mesh>
    <mesh position={[0, h * .53, .068]}><boxGeometry args={[.105, h * .34, .006]} /><meshStandardMaterial color="#f8f3e8" roughness={.8} /></mesh>
  </group>;
}
function Produce({ position, color }: { position: [number, number, number]; color: string }) {
  return <mesh position={position} castShadow><sphereGeometry args={[.075, 12, 10]} /><meshStandardMaterial color={color} roughness={.9} /></mesh>;
}
export default function SupermarketProps() {
  const rows = [-4.5, 4.5];
  const products = ['#d92735','#e7b82d','#3189c9','#2e9b61','#7d4caa','#e77b29'];
  return <group>
    {rows.map((x, ri) => <group key={x}>
      {/* steel gondola shelves and upright frames */}
      {[ -2, 2 ].map(z => <group key={z} position={[x, 0, z]}>
        <mesh position={[0, .93, 0]} castShadow receiveShadow><boxGeometry args={[5.85, .07, .72]} /><meshStandardMaterial color="#aeb7bd" metalness={.62} roughness={.38} /></mesh>
        <mesh position={[0, 1.48, 0]} castShadow><boxGeometry args={[5.85, .055, .72]} /><meshStandardMaterial color="#aeb7bd" metalness={.62} roughness={.38} /></mesh>
        {[-2.82,2.82].map(xx => <mesh key={xx} position={[xx, 1.28, 0]}><boxGeometry args={[.055, .98, .78]} /><meshStandardMaterial color="#6d7b83" metalness={.55} roughness={.42} /></mesh>)}
        {Array.from({length:10},(_,i) => {
          const px = -2.5 + i * .55, color = products[(i + ri * 2 + (z > 0 ? 1 : 0)) % products.length];
          return <group key={i} position={[px, .98, 0]}>
            {i % 4 === 0 ? <Bottle position={[0,0,-.16]} color={color} scale={.82}/> : i % 4 === 1 ? <Can position={[0,0,-.16]} color={color}/> : <Carton position={[0,0,-.16]} color={color} tall={i%3===0}/>}
            {i % 3 === 0 ? <Bottle position={[0,0,.16]} color={products[(i+2)%products.length]} scale={.82}/> : <Carton position={[0,0,.16]} color={products[(i+3)%products.length]}/>}
          </group>;
        })}
        {Array.from({length:7},(_,i)=><group key={'top'+i} position={[-2.45+i*.8,1.52,0]}>
          <Carton position={[0,0,-.14]} color={products[(i+ri)%products.length]} tall/>
          <Carton position={[0,0,.12]} color={products[(i+ri+2)%products.length]}/>
        </group>)}
      </group>)}
    </group>)}
    {/* fresh-produce bins beside the grocery aisle */}
    {[-6.2, 6.2].map((x, j) => <group key={x} position={[x,0,0]}>
      <mesh position={[0,.48,0]} castShadow><boxGeometry args={[1.15,.9,2.8]} /><meshStandardMaterial color="#8b633f" roughness={.8} /></mesh>
      <mesh position={[0,.96,0]}><boxGeometry args={[1.18,.06,2.82]} /><meshStandardMaterial color="#c7b18b" roughness={.75} /></mesh>
      {Array.from({length:20},(_,i)=><Produce key={i} position={[(i%4)*.22-.33,.99+((i*7)%4)*.035,Math.floor(i/4)*.52-1.2]} color={['#d83c32','#e9bd32','#4e9c4a','#dd7d28'][(i+j)%4]}/>)}
    </group>)}
  </group>;
}
