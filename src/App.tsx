import { createHashRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './pages/NotFound';
import Documentation from './pages/Documentation'

const router = createHashRouter([
  {
    path: "/",
    element: <Home />,
    errorElement: <NotFound />,
  },
  {
    path: "/documentation",
    element: <Documentation />,
  }
]);

function App() {
  return <RouterProvider router={router} />
}

export default App
