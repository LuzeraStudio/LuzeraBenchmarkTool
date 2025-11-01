import { createHashRouter, RouterProvider } from 'react-router-dom'
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, } from "@/components/ui/toast";
import { useToast } from "@/hooks/useToast";
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
  const { toasts } = useToast();

  return (
    <ToastProvider>
      <RouterProvider router={router} />
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

export default App
