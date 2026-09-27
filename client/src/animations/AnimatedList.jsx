import { useOrbitReducedMotion } from './useOrbitReducedMotion.js';
import { AnimatePresence, motion } from 'motion/react';
import { listItem, reduced } from './motionPresets.js';

const motionElements = { article: motion.article, div: motion.div, li: motion.li, section: motion.section };

export function AnimatedList({ items, getKey = (item) => item._id, renderItem, className = '', as = 'div' }) {
  const reduce = useOrbitReducedMotion();
  const Container = motionElements[as] || motion.div;
  const preset = reduce ? reduced(listItem) : listItem;
  return <Container layout={!reduce} className={className}><AnimatePresence initial={items.length < 16}>
    {items.map((item) => {
      const content = renderItem(item);
      if (typeof content?.type === 'string') {
        const Row = motionElements[content.type] || motion.div;
        return <Row key={getKey(item)} layout={!reduce} {...preset} {...content.props} />;
      }
      return <motion.div key={getKey(item)} layout={!reduce} {...preset}>{content}</motion.div>;
    })}
  </AnimatePresence></Container>;
}
