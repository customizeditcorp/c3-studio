import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'C3 Studio',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        items: []
      },
      {
        title: 'Clientes',
        url: '/clients',
        icon: 'teams',
        isActive: false,
        items: []
      },
      {
        title: 'Diagnóstico',
        url: '/diagnostic',
        icon: 'forms',
        isActive: false,
        items: []
      },
      {
        title: 'Onboarding',
        url: '#',
        icon: 'kanban',
        isActive: false,
        items: [
          {
            title: 'Credenciales',
            url: '/onboarding/credentials',
            icon: 'account'
          },
          {
            title: 'Verificación NAP',
            url: '/onboarding/nap',
            icon: 'notification'
          }
        ]
      },
      {
        title: 'Preview',
        url: '/preview/generator',
        icon: 'dashboard',
        isActive: false,
        items: []
      },
      {
        title: 'Fotos',
        url: '/photos',
        icon: 'media',
        isActive: false,
        items: []
      },
      {
        title: 'GBP',
        url: '/gbp',
        icon: 'workspace',
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'Sistema',
    items: [
      {
        title: 'Configuración',
        url: '/dashboard/settings',
        icon: 'settings',
        isActive: false,
        items: []
      }
    ]
  }
];
