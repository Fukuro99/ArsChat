import type React from 'react';
import type { PrimitiveProps } from '../types';
import Badge from './Badge';
import Box from './Box';
import Button from './Button';
import Checkbox from './Checkbox';
import Chips from './Chips';
import Clickable from './Clickable';
import Divider from './Divider';
import Grid from './Grid';
import Icon from './Icon';
import Image from './Image';
import Input from './Input';
import ProgressBar from './ProgressBar';
import Scroll from './Scroll';
import Select from './Select';
import Slider from './Slider';
import Text from './Text';

/** プリミティブ名 → Reactコンポーネントのマッピング */
export const primitiveRegistry: Record<string, React.ComponentType<PrimitiveProps>> = {
  box: Box,
  grid: Grid,
  scroll: Scroll,
  divider: Divider,
  text: Text,
  icon: Icon,
  badge: Badge,
  'progress-bar': ProgressBar,
  button: Button,
  clickable: Clickable,
  input: Input,
  select: Select,
  checkbox: Checkbox,
  slider: Slider,
  chips: Chips,
  image: Image,
};
