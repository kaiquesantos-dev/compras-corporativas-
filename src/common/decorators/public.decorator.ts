import { SetMetadata } from '@nestjs/common';

// Decorator usado assim: @Public() em cima de um método de controller. Ele
// não faz nenhuma verificação sozinho — só "cola uma etiqueta" (metadata)
// dizendo que esta rota não deve exigir X-API-KEY. Quem realmente lê essa
// etiqueta é o ApiKeyGuard. Uso raro e proposital: hoje só o health check
// usa isto, porque orquestradores (Docker, Kubernetes) checam a saúde da
// aplicação sem ter (nem dever ter) uma credencial da API.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
