import { fireEvent, renderWithProviders, screen } from '@/test-utils/render';

import { Button } from '../Button';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { Field } from '../Field';
import { StateView } from '../StateView';
import { Text } from '../Text';

describe('Text', () => {
  it('applies the variant and colour from the theme', async () => {
    await renderWithProviders(
      <Text variant="title2" color="inkSecondary">
        Tuesday morning
      </Text>,
    );

    expect(screen.getByText('Tuesday morning')).toHaveStyle({ color: '#6B615A', fontSize: 24 });
  });
});

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save" onPress={onPress} loading />);

    await fireEvent.press(screen.getByLabelText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes disabled state to assistive technology', async () => {
    await renderWithProviders(<Button label="Save" onPress={jest.fn()} disabled />);

    expect(screen.getByLabelText('Save')).toBeDisabled();
  });

  it('visibly dims when disabled', async () => {
    // Regression: the dim used to sit in a static style after the animated one,
    // which Reanimated overrode — so a disabled button looked fully enabled.
    await renderWithProviders(<Button label="Save" onPress={jest.fn()} disabled />);

    expect(screen.getByLabelText('Save')).toHaveStyle({ opacity: 0.4 });
  });
});

describe('Chip', () => {
  it('reports selection through accessibilityState rather than colour alone', async () => {
    await renderWithProviders(<Chip label="Calm" selected onPress={jest.fn()} />);

    expect(screen.getByLabelText('Calm')).toBeChecked();
  });

  it('renders as static content when no handler is given', async () => {
    await renderWithProviders(<Chip label="Nostalgic" />);

    expect(screen.getByText('Nostalgic')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('Field', () => {
  it('links its error message to the input for screen readers', async () => {
    await renderWithProviders(<Field label="Email" error="That email doesn't look right." />);

    expect(screen.getByLabelText('Email').props['aria-invalid']).toBe(true);
    expect(screen.getByText("That email doesn't look right.")).toBeOnTheScreen();
  });

  it('shows the hint when there is no error', async () => {
    await renderWithProviders(<Field label="Title" hint="Optional." />);

    expect(screen.getByText('Optional.')).toBeOnTheScreen();
  });
});

describe('StateView', () => {
  it('renders the empty state when data is empty', async () => {
    await renderWithProviders(
      <StateView
        status="success"
        data={[] as string[]}
        isEmpty={(items) => items.length === 0}
        empty={{ title: 'Nothing here yet' }}
      >
        {() => <Text>unreachable</Text>}
      </StateView>,
    );

    expect(screen.getByText('Nothing here yet')).toBeOnTheScreen();
    expect(screen.queryByText('unreachable')).toBeNull();
  });

  it('renders an error state instead of a blank screen on failure', async () => {
    await renderWithProviders(
      <StateView status="error" data={undefined} empty={{ title: 'Nothing here yet' }}>
        {() => <Text>unreachable</Text>}
      </StateView>,
    );

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('unreachable')).toBeNull();
  });

  it('renders children on success', async () => {
    await renderWithProviders(
      <StateView status="success" data={['A walk by the river']} empty={{ title: 'Empty' }}>
        {(items) => <Text>{items[0]}</Text>}
      </StateView>,
    );

    expect(screen.getByText('A walk by the river')).toBeOnTheScreen();
  });
});

describe('EmptyState', () => {
  it('invites an action rather than reporting absence', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <EmptyState title="Nothing here yet" action={{ label: 'Capture something', onPress }} />,
    );

    await fireEvent.press(screen.getByLabelText('Capture something'));
    expect(onPress).toHaveBeenCalled();
  });
});
