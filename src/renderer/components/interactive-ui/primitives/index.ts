import React from 'react';
import Box from './Box';
import Grid from './Grid';
import Scroll from './Scroll';
import Divider from './Divider';
import Text from './Text';
import Icon from './Icon';
import Badge from './Badge';
import ProgressBar from './ProgressBar';
import Button from './Button';
import Clickable from './Clickable';
import Input from './Input';
import Select from './Select';
import Checkbox from './Checkbox';
import Slider from './Slider';
import Chips from './Chips';
import { PrimitiveProps } from '../types';

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
};
