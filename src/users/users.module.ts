import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// UsersService é exportado porque outros módulos (ex: PurchaseRequests, ao
// trazer os dados do solicitante de uma solicitação) reaproveitam a mesma
// constante USER_SELECT definida lá, evitando duplicar essa lista de campos.
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
