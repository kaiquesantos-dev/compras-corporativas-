import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DelegateAdminDto } from './dto/delegate-admin.dto';
import { UsersService } from './users.service';

// Aqui os guards e o @Roles('ADMIN') ficam no controller inteiro (e não
// método a método, como em Departments): TODA rota de usuários, incluindo
// as de leitura, é restrita a ADMIN.
@ApiTags('Usuários')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar usuário',
    description:
      '**Papéis permitidos:** ADMIN\n\nCria um novo usuário no sistema. Criar uma conta com papel ADMIN exige um ADMIN de verdade — acesso delegado (isAdminDelegate) não é suficiente, senão a delegação temporária viraria acesso permanente. Um usuário REQUESTER precisa de departamento.',
  })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso.' })
  @ApiResponse({
    status: 403,
    description: 'Tentativa de criar um ADMIN usando apenas acesso delegado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos no corpo da requisição.',
  })
  @ApiResponse({
    status: 404,
    description: 'Departamento informado não existe.',
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe um usuário com esse email.',
  })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar usuários',
    description:
      '**Papéis permitidos:** ADMIN\n\nLista usuários com paginação e ordenação. Nunca retorna a senha.',
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar usuário por ID',
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar usuário',
    description:
      '**Papéis permitidos:** ADMIN\n\nSe o alvo for um ADMIN, só um ADMIN de verdade pode editá-lo — acesso obtido só por delegação (isAdminDelegate) não é suficiente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Alvo é ADMIN e quem chama só tem acesso delegado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário ou departamento não encontrado.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Patch(':id/admin-delegate')
  @ApiOperation({
    summary: 'Conceder ou revogar delegação de acesso ADMIN',
    description:
      '**Papéis permitidos:** ADMIN (só um ADMIN de verdade — um usuário com acesso apenas delegado não pode criar novas delegações)\n\nConcede acesso ADMIN temporário a um usuário APPROVER (ex: cobrir férias do admin) ou revoga. Não altera o "role" real do usuário — é um toggle manual, sem data de início/fim.',
  })
  @ApiResponse({ status: 200, description: 'Delegação atualizada.' })
  @ApiResponse({
    status: 400,
    description: 'O usuário alvo não é um APPROVER.',
  })
  @ApiResponse({
    status: 403,
    description: 'Quem chama só tem acesso ADMIN delegado, não real.',
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  delegateAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DelegateAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.delegateAdmin(id, dto.granted, actor);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover usuário',
    description:
      '**Papéis permitidos:** ADMIN\n\nSe o alvo for um ADMIN, só um ADMIN de verdade pode removê-lo — acesso obtido só por delegação (isAdminDelegate) não é suficiente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Alvo é ADMIN e quem chama só tem acesso delegado.',
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({
    status: 409,
    description:
      'Usuário possui registros vinculados (ex: solicitações de compra criadas por ele).',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.remove(id, actor);
  }
}
