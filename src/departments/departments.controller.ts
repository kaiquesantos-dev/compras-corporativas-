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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentsService } from './departments.service';

// Exemplo de "acesso misto": o @UseGuards(JwtAuthGuard) aqui no topo já
// exige login para QUALQUER rota deste controller. Mas só os métodos que
// também têm @Roles('ADMIN') exigem, além de estar logado, ser ADMIN — os
// GETs de consulta ficam liberados para qualquer papel autenticado.
@ApiTags('Departamentos')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Criar departamento',
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({ status: 201, description: 'Departamento criado.' })
  @ApiResponse({
    status: 409,
    description: 'Já existe um departamento com esse nome.',
  })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar departamentos',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.departmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar departamento por ID',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  @ApiResponse({ status: 404, description: 'Departamento não encontrado.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Atualizar departamento',
    description: '**Papéis permitidos:** ADMIN',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Remover departamento',
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({
    status: 409,
    description: 'Departamento possui usuários ou solicitações vinculadas.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.remove(id);
  }
}
