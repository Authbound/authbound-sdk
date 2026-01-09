/**
 * @authbound/react/testing
 *
 * Testing utilities for Authbound React SDK.
 *
 * @example
 * ```tsx
 * import { MockAuthboundProvider, MockScenarios, useMockAuthbound } from '@authbound/react/testing';
 *
 * describe('VerificationFlow', () => {
 *   it('handles successful verification', async () => {
 *     render(
 *       <MockAuthboundProvider config={{ scenario: 'normalSuccess' }}>
 *         <VerificationWall>
 *           <div data-testid="protected">Protected Content</div>
 *         </VerificationWall>
 *       </MockAuthboundProvider>
 *     );
 *
 *     // Wait for verification to complete
 *     await waitFor(() => {
 *       expect(screen.getByTestId('protected')).toBeInTheDocument();
 *     });
 *   });
 * });
 * ```
 */

export {
  MockAuthboundProvider,
  useMockAuthbound,
  MockScenarios,
  waitForStatus,
  createMockResult,
  createMockError,
  type MockConfig,
  type MockScenario,
  type MockAuthboundProviderProps,
} from "./testing/mock-provider";
