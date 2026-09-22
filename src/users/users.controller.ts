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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
      '**Papéis permitidos:** ADMIN\n\nCria um novo usuário no sistema.',
  })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso.' })
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
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
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
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário ou departamento não encontrado.',
  })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover usuário',
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({
    status: 409,
    description:
      'Usuário possui registros vinculados (ex: solicitações de compra criadas por ele).',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
