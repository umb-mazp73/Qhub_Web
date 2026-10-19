import { icons, logos, type IconName, type LogoName } from '@qhub/design';

/** Íconos del set propio (trazo 1.5 px, cuadrícula 16). Heredan el color del texto. */
export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  const svg = icons[name].replace('<svg ', `<svg width="${size}" height="${size}" `);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-flex flex-none" style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const svgOf = (name: LogoName, height: number) => logos[name].replace(/ width="\d+" height="\d+"/, ` height="${height}"`);

/** Logo oficial. El horizontal por defecto cambia solo a la versión negativa en tema oscuro (sistema o elegido); las demás se usan tal cual. */
export function Logo({ name = 'qhub-horizontal', height = 24 }: { name?: LogoName; height?: number }) {
  if (name !== 'qhub-horizontal') return <span role="img" aria-label="Qhub" className="inline-flex" dangerouslySetInnerHTML={{ __html: svgOf(name, height) }} />;
  return (
    <span role="img" aria-label="Qhub" className="inline-flex">
      <span aria-hidden className="qh-logo-light inline-flex" dangerouslySetInnerHTML={{ __html: svgOf('qhub-horizontal', height) }} />
      <span aria-hidden className="qh-logo-dark hidden" dangerouslySetInnerHTML={{ __html: svgOf('qhub-horizontal-negativo', height) }} />
    </span>
  );
}
