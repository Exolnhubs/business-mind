import Svg, { Circle, Polyline, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  if (planId === 'user_premium') {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <Polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  if (planId === 'org_pro') {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Defs>
          <LinearGradient id="plat" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#A8A9AD" />
            <Stop offset="100%" stopColor="#E8E9EC" />
          </LinearGradient>
        </Defs>
        <Circle cx="10" cy="10" r="10" fill="url(#plat)" />
        <Polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  if (planId === 'org_elite') {
    const s = size * (22 / 20)
    return (
      <Svg width={s} height={s} viewBox="0 0 22 22">
        <Defs>
          <RadialGradient id="gold" cx="35%" cy="35%" r="65%">
            <Stop offset="0%" stopColor="#FFE066" />
            <Stop offset="100%" stopColor="#FF8C00" />
          </RadialGradient>
        </Defs>
        <Circle cx="11" cy="11" r="10.5" fill="none" stroke="#FFD700" strokeWidth="1" />
        <Circle cx="11" cy="11" r="9" fill="url(#gold)" />
        <Polyline
          points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  return null
}
